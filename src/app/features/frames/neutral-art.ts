const SAMPLE_SIZE = 600;
const CHECKER = 50;

/** Gera (data URL) uma arte NEUTRA — gradiente cinza + xadrez sutil — ou `null`. */
export function neutralArtDataUrl(): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  const grad = ctx.createLinearGradient(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  grad.addColorStop(0, '#e6e6e6');
  grad.addColorStop(1, '#a8a8a8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = 0; y < SAMPLE_SIZE; y += CHECKER) {
    for (let x = 0; x < SAMPLE_SIZE; x += CHECKER) {
      if ((x / CHECKER + y / CHECKER) % 2 === 0) {
        ctx.fillRect(x, y, CHECKER, CHECKER);
      }
    }
  }
  return canvas.toDataURL('image/png');
}

/** Carrega a arte neutra como `HTMLImageElement` (callback quando pronta). */
export function loadNeutralArt(onReady: (img: HTMLImageElement) => void): void {
  const url = neutralArtDataUrl();
  if (!url) {
    return;
  }
  const img = new Image();
  img.onload = () => onReady(img);
  img.src = url;
}
