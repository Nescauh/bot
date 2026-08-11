export function getBrazilDate() {
  const now = new Date();
  const brString = now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(brString);
}

export function parseAndValidateDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return { isValid: false, reason: 'Data vazia ou formato inválido' };
  }

  const match = dateStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return { isValid: false, reason: 'Formato deve ser DD/MM/AAAA' };
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  const brNow = getBrazilDate();
  const currentYear = brNow.getFullYear();

  if (month < 1 || month > 12) {
    return { isValid: false, reason: 'Mês inválido' };
  }

  if (year < 1900 || year > currentYear) {
    return { isValid: false, reason: 'Ano inválido' };
  }

  // Validação estrita de dia no mês (impede ex: 31/02)
  const testDate = new Date(year, month - 1, day);
  if (testDate.getFullYear() !== year || testDate.getMonth() !== (month - 1) || testDate.getDate() !== day) {
    return { isValid: false, reason: 'Dia inválido para o mês fornecido' };
  }

  const pad = (n) => String(n).padStart(2, '0');
  const formattedDate = `${pad(day)}/${pad(month)}/${year}`;

  return { isValid: true, day, month, year, formattedDate };
}

export function calculateBirthdayCountdown(day, month, birthYear) {
  const brNow = getBrazilDate();
  const currentYear = brNow.getFullYear();

  const isToday = brNow.getMonth() === (month - 1) && brNow.getDate() === day;

  if (isToday) {
    return {
      isToday: true,
      countdownText: '🎉 É HOJE! 🎉',
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      totalDaysRemaining: 0,
      nextYear: currentYear
    };
  }

  // Determinar o próximo ano em que ocorrerá o aniversário
  let targetYear = currentYear;
  // Trata 29/02: em JS new Date(targetYear, 1, 29) rola para 01/03 em anos não-bissextos
  let nextBday = new Date(targetYear, month - 1, day);
  const todayStart = new Date(currentYear, brNow.getMonth(), brNow.getDate());

  if (nextBday < todayStart) {
    targetYear = currentYear + 1;
    nextBday = new Date(targetYear, month - 1, day);
  }

  const diffMs = nextBday.getTime() - brNow.getTime();

  // Cálculo de Meses, Dias, Horas e Minutos
  let tempDate = new Date(brNow.getTime());
  let months = 0;

  while (true) {
    const nextMonthDate = new Date(tempDate.getTime());
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    if (nextMonthDate <= nextBday) {
      months++;
      tempDate = nextMonthDate;
    } else {
      break;
    }
  }

  const remainingDiffMs = nextBday.getTime() - tempDate.getTime();
  const totalSeconds = Math.floor(remainingDiffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  let parts = [];
  if (months > 0) parts.push(`${months} ${months === 1 ? 'mês' : 'meses'}`);
  if (days > 0) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);

  let countdownText = '';
  if (parts.length === 1) {
    countdownText = parts[0];
  } else if (parts.length === 2) {
    countdownText = `${parts[0]} e ${parts[1]}`;
  } else {
    const lastPart = parts.pop();
    countdownText = `${parts.join(', ')} e ${lastPart}`;
  }

  const totalDaysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    isToday: false,
    countdownText,
    months,
    days,
    hours,
    minutes,
    totalDaysRemaining,
    nextYear: targetYear
  };
}

export function formatDayMonthText(day, month) {
  const MONTH_NAMES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(day)}/${pad(month)}`;
}
