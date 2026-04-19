export function getPm25Category(pm25: number): string {
  if (pm25 <= 50) {
    return "Good";
  }
  if (pm25 <= 100) {
    return "Satisfactory";
  }
  if (pm25 <= 200) {
    return "Moderate";
  }
  if (pm25 <= 300) {
    return "Poor";
  }
  if (pm25 <= 400) {
    return "Very Poor";
  }
  return "Severe";
}

export function getPm25Color(pm25: number): string {
  if (pm25 < 50) {
    return "#4ADE80";
  }
  if (pm25 < 100) {
    return "#FCD34D";
  }
  if (pm25 < 200) {
    return "#FB923C";
  }
  return "#FB7185";
}

export function getImpactTone(score: number): string {
  if (score <= 3) {
    return "#4ADE80";
  }
  if (score <= 6) {
    return "#FCD34D";
  }
  if (score <= 8) {
    return "#FB923C";
  }
  return "#FB7185";
}

export function formatRelativeTime(timestamp: string): string {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) {
    return "Just now";
  }

  const diffMs = Date.now() - value;
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} day ago`;
}

export function formatLocalTime(timestamp: string): string {
  const value = Date.parse(timestamp);
  if (Number.isNaN(value)) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
