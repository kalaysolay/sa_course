/* Публичные цены предзаписи: страну определяет сервер по IP. */
(async function () {
  const format = (amount, currency) => new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: currency === 'USD' ? 2 : 0,
    maximumFractionDigits: 2
  }).format(amount);

  try {
    const response = await fetch('/api/pricing', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return;
    const price = await response.json();
    if (!['KZT', 'RUB', 'USD'].includes(price.currency)
        || !Number.isFinite(price.monthlyAmount) || price.monthlyAmount <= 0) return;
    document.querySelectorAll('[data-price-monthly]').forEach((node) => {
      node.textContent = format(price.monthlyAmount, price.currency);
    });
    document.querySelectorAll('[data-price-free]').forEach((node) => {
      node.textContent = format(0, price.currency);
    });
    if (Number.isInteger(price.freeReviewTasks) && price.freeReviewTasks >= 0) {
      document.querySelectorAll('[data-free-review-tasks]').forEach((node) => {
        node.textContent = `Отправка решений по задачам на выбор: ${price.freeReviewTasks}. Повторные попытки по этим задачам не расходуют лимит новых задач.`;
      });
    }
  } catch (_) {
    // Без API остаётся международная цена из разметки; предзапись доступна.
  }
})();
