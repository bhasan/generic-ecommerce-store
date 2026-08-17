export const parsePollingInterval = (rawValue, fallback) => {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
