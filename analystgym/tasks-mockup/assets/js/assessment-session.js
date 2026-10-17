/* Согласование прохождения: сервер считает, локальная копия сохраняет ещё не подтверждённые ответы. */
window.AssessmentSession = (() => {
  let timer, flight = null, generation = 0;
  const copy = value => JSON.parse(JSON.stringify(value));
  const changed = () => window.dispatchEvent(new Event('ag:assessment-sync'));
  function fence() {
    const owner = Store.owner(), turn = generation;
    return () => { if (turn !== generation || Store.owner() !== owner) throw new Error('Аккаунт изменился'); };
  }
  function write(value) { Store.saveAssessment(value); changed(); return value; }
  function progress(s) { return { answers: s.answers || {}, flags: s.flags || {}, index: s.index || 0, version: s.version }; }
  function apply(view, token, previous = Store.assessment()) {
    let backup = previous?.runId === view.id ? previous.unsyncedBackup : null;
    if (view.status === 'completed' && previous?.runId === view.id && previous.dirty && JSON.stringify(previous.answers) !== JSON.stringify(view.answers)) backup = copy(progress(previous));
    return write({ ...view, runId: view.id, guestToken: token || null, server: true, dirty: false, previousRunBackup: previous?.previousRunBackup, unsyncedBackup: backup, sync: backup ? 'conflict_completed' : 'saved' });
  }

  async function load() {
    if (Api.mode !== 'server') return Store.assessment();
    const guard = fence();
    const local = Store.assessment();
    if (local?.server && local.runId) {
      if (local.starting) return local;
      // Неподтверждённые правки не затираем даже при доступном более новом серверном состоянии.
      let view;
      try { view = await Api.getAssessmentRun(local.runId, local.guestToken); }
      catch (error) { guard(); if ([404, 410].includes(error.status)) return write({ ...local, unavailable: true, sync: 'expired' }); throw error; }
      guard();
      if (local.dirty && view.status !== 'completed') return write({ ...local, sync: view.version === local.version ? 'local' : 'conflict' });
      return apply(view, local.guestToken);
    }
    if (Api.user) {
      const current = await Api.currentAssessmentRun();
      guard();
      if (current?.id) return apply(current, null);
      const history = await Api.assessmentHistory();
      guard();
      if (history === null) throw new Error('История диагностики недоступна');
      if (history.length) {
        const saved = await Api.assessmentSubmission(history[0].submissionId);
        guard();
        return write({ ...saved, server: true, finishedAt: saved.createdAt, sync: 'saved' });
      }
    }
    return null;
  }

  async function begin() {
    const guard = fence();
    const current = Store.assessment();
    // Повтор старта с потерянным ответом использует прежние id и гостевой секрет.
    const s = current?.starting ? current : { runId: crypto.randomUUID(), guestToken: Api.user ? null : crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''), starting: true, server: true, sync: 'local', answers: {}, flags: {}, index: 0,
      previousRunBackup: current?.unavailable ? { ...current, previousRunBackup: undefined } : current?.previousRunBackup };
    write(s);
    const view = await Api.startAssessmentRun(s.runId, s.guestToken); guard();
    return apply(view, s.guestToken);
  }

  function save(values) {
    const s = Store.assessment();
    write({ ...s, ...copy(values), dirty: true, sync: 'local' });
    clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), 600);
  }

  async function flush() {
    clearTimeout(timer);
    if (flight) { await flight; return Store.assessment()?.dirty ? flush() : Store.assessment(); }
    const s = Store.assessment();
    if (!s?.dirty) return s;
    const owner = Store.owner(), turn = generation, sent = progress(s);
    flight = (async () => {
      try {
        const view = await Api.saveAssessmentRun(s.runId, s.guestToken, sent);
        if (turn !== generation || Store.owner() !== owner) throw new Error('Аккаунт изменился');
        const live = Store.assessment();
        if (JSON.stringify(progress(live)) === JSON.stringify(sent)) return apply(view, s.guestToken);
        return write({ ...live, version: view.version, sync: 'local', dirty: true });
      } catch (error) {
        if (turn === generation && Store.owner() === owner) write({ ...Store.assessment(), sync: error.status === 409 ? 'conflict' : 'error', dirty: true });
        throw error;
      }
    })();
    try { await flight; } finally { flight = null; }
    return Store.assessment()?.dirty ? flush() : Store.assessment();
  }

  async function retry() {
    const guard = fence();
    const local = Store.assessment();
    if (local.sync === 'conflict') {
      const fresh = await Api.getAssessmentRun(local.runId, local.guestToken);
      guard();
      if (fresh.status === 'completed') { apply(fresh, local.guestToken); location.reload(); return; }
      const choice = await AppUI.confirm({ title: 'Ответы изменены на другом устройстве',
        text: 'Можно сохранить вашу локальную копию поверх свежей серверной или загрузить серверные ответы. Локальная копия пока остаётся здесь.',
        confirmText: 'Сохранить мои ответы', cancelText: 'Загрузить серверные', dismissValue: null });
      guard();
      if (choice === null) return;
      if (!choice) { apply(fresh, local.guestToken); location.reload(); return; }
      write({ ...local, version: fresh.version, dirty: true, sync: 'local' });
    }
    return flush();
  }

  async function finish() {
    const guard = fence();
    await flush(); guard(); const s = Store.assessment();
    try { const view = await Api.finishAssessmentRun(s.runId, s.guestToken, progress(s)); guard(); return apply(view, s.guestToken); }
    catch (error) { guard(); write({ ...s, sync: error.status === 409 ? 'conflict' : 'error' }); throw error; }
  }

  async function claimGuest() {
    const guard = fence();
    const guest = Store.guestAssessment();
    if (!guest?.runId || !guest.guestToken || !Api.user) throw new Error('Нет гостевого прохождения');
    const view = await Api.claimAssessmentRun(guest.runId, guest.guestToken); guard();
    const result = apply(view, null, guest);
    if (guest.dirty && view.status !== 'completed') write({ ...result, ...progress(guest), version: view.version, dirty: true, sync: view.version === guest.version + 1 ? 'local' : 'conflict' });
    Store.clearGuestAssessment();
    if (Store.assessment().sync === 'local') return flush();
    return Store.assessment();
  }

  window.addEventListener('ag:before-account-change', () => { generation++; clearTimeout(timer); });
  return { load, begin, save, flush, retry, finish, claimGuest };
})();
