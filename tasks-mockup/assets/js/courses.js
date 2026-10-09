/* ============================================================
   courses.js — каталог курсов: карточки с лого, ценой, прогрессом
   ============================================================ */

(function () {

  function totalMinutes(course) {
    return SA_DATA.flatLessons(course).reduce((sum, lesson) => sum + (lesson.minutes || 0), 0);
  }

  function startLesson(course) {
    const flat = SA_DATA.flatLessons(course);
    const open = flat.find((lesson) => Store.isLessonOpen(course.id, lesson) && !Store.isLessonDone(course.id, lesson.id));
    return open || flat[0];
  }

  function priceHtml(course) {
    if (!course.price) return '<span class="course-price-free">Бесплатно</span>';
    return `
      <span class="course-price">${course.price.toLocaleString('ru-RU')} ₽</span>
      ${course.oldPrice ? `<span class="course-price-old">${course.oldPrice.toLocaleString('ru-RU')} ₽</span>` : ''}`;
  }

  function ctaLabel(course, progress) {
    if (progress.done > 0 && progress.done < progress.total) return 'Продолжить';
    if (progress.done === progress.total && progress.total > 0) return 'Повторить';
    return course.price ? 'Перейти' : 'Начать бесплатно';
  }

  document.addEventListener('DOMContentLoaded', () => {
    AppUI.mountHeader('courses', 'course');
    AppUI.mountFooter('course');

    const courses = (SA_DATA.courses || []);
    const host = document.getElementById('coursesHost');

    const totalLessons = courses.reduce((sum, c) => sum + SA_DATA.flatLessons(c).length, 0);
    const started = courses.filter((c) => (Store.courseState(c.id).completed || []).length > 0).length;
    document.getElementById('coursesStats').innerHTML = `
      <span class="badge">${courses.length} ${AppUI.plural(courses.length, ['курс', 'курса', 'курсов'])}</span>
      <span class="badge">${totalLessons} ${AppUI.plural(totalLessons, ['урок', 'урока', 'уроков'])}</span>
      <span class="badge badge-ok">начато: ${started}</span>
      <a class="badge" href="catalog.html" style="cursor:pointer">задачи тренажёра →</a>
    `;

    host.innerHTML = courses.map((course) => {
      const progress = Store.courseProgress(course.id);
      const next = startLesson(course);
      const flat = SA_DATA.flatLessons(course);
      const minutes = totalMinutes(course);
      const hours = Math.round((minutes / 60) * 10) / 10;
      return `
        <article class="panel card-hover course-card">
          <div class="course-card-top">
            <span class="course-logo" style="background:${course.logo.bg}">${AppUI.esc(course.logo.letters)}</span>
            <div class="grow">
              <h3>${AppUI.esc(course.title)}</h3>
              <div class="tagline">${AppUI.esc(course.tagline)}</div>
              <p class="desc">${AppUI.esc(course.description)}</p>
            </div>
          </div>
          <ul class="course-outcomes">
            ${(course.outcomes || []).slice(0, 3).map((o) => `<li>${AppUI.esc(o)}</li>`).join('')}
          </ul>
          <div class="course-meta">
            <span><b>${flat.length}</b> ${AppUI.plural(flat.length, ['урок', 'урока', 'уроков'])}</span>
            <span>≈ <b>${hours}</b> ч</span>
            <span>${AppUI.esc(course.level)}</span>
            ${progress.total && progress.done ? `<span class="badge badge-ok">пройдено ${progress.done}/${progress.total}</span>` : ''}
          </div>
          <div class="course-foot">
            ${priceHtml(course)}
            <a class="btn ${course.price ? 'btn-primary' : 'btn-outline'} btn-sm" href="course.html?id=${AppUI.esc(course.id)}${next && flat.length && next.id !== flat[0].id ? `&lesson=${AppUI.esc(next.id)}` : ''}">${ctaLabel(course, progress)}</a>
          </div>
        </article>`;
    }).join('');
  });
})();
