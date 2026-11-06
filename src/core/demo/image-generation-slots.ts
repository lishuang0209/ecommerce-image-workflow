export const concurrentImageLimit = 2;

let activeImages = 0;

export function reserveImageGeneration() {
  if (activeImages >= concurrentImageLimit) return false;
  activeImages += 1;
  return true;
}

export function releaseImageGeneration() {
  activeImages = Math.max(0, activeImages - 1);
}
