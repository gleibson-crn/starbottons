import type { MockupSprite, SceneTargetPx } from '../../../shared/ui';

/** Parâmetros de um frame de preview do mockup contextual. */
export interface ScenePreviewFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly scene: HTMLImageElement | null;
  readonly sprite: MockupSprite | null;
  readonly target: SceneTargetPx;
}

/** Desenha o frame completo: cena fixa → scrim → botton no alvo → anel duplo. */
export function drawScenePreview(f: ScenePreviewFrame): void {
  const { ctx, width, height } = f;
  ctx.clearRect(0, 0, width, height);
  drawBackground(f);
  drawScrim(f);
  drawSprite(f);
  drawTargetRing(ctx, f.target);
}

function drawBackground(f: ScenePreviewFrame): void {
  const { ctx, width, height, scene } = f;
  if (scene) {
    ctx.drawImage(scene, 0, 0, width, height);
    return;
  }
  ctx.fillStyle = 'hsl(240 16% 90%)';
  ctx.fillRect(0, 0, width, height);
}

/** Escurece a cena FORA do alvo (evenodd), destacando a área do botton. */
function drawScrim(f: ScenePreviewFrame): void {
  const { ctx, width, height, target } = f;
  ctx.save();
  ctx.fillStyle = 'hsl(240 30% 8% / 42%)';
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.moveTo(target.cx + target.r, target.cy);
  ctx.arc(target.cx, target.cy, target.r, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.restore();
}

/** Cola o sprite do botton no alvo (translate → rotate → scale → drawImage). */
function drawSprite(f: ScenePreviewFrame): void {
  const { ctx, sprite, target } = f;
  if (!sprite || sprite.discRadiusPx <= 0) {
    return;
  }
  const k = target.r / sprite.discRadiusPx;
  ctx.save();
  ctx.translate(target.cx, target.cy);
  ctx.rotate((target.rotation * Math.PI) / 180);
  ctx.scale(k, k);
  ctx.drawImage(sprite.canvas, -sprite.discCenter.x, -sprite.discCenter.y);
  ctx.restore();
}

/** Anel duplo: halo branco (contraste) + traço primário (identidade). */
function drawTargetRing(
  ctx: CanvasRenderingContext2D,
  target: SceneTargetPx,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(target.cx, target.cy, target.r, 0, Math.PI * 2);
  ctx.strokeStyle = 'hsl(0 0% 100% / 92%)';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(target.cx, target.cy, target.r, 0, Math.PI * 2);
  ctx.strokeStyle = 'hsl(245 72% 58%)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}
