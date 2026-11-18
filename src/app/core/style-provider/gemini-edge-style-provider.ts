import { inject, Injectable } from '@angular/core';
import { APP_CONFIG } from '../config/app-config';
import { SupabaseClientService } from '../supabase';
import type {
  StyleOption,
  StyleProvider,
  StyleTransferRequest,
  StyleTransferResult,
} from './style-provider';
import { StyleTransferError } from './style-provider';

/**
 * Estilos oferecidos — ids/labels IDÊNTICOS aos aceitos pela Edge
 * `style-transfer` (ADR-021). Os ids são GENÉRICOS (sem nome de franquia).
 */
const GEMINI_STYLES: readonly StyleOption[] = [
  { id: 'cartoon', label: 'Cartoon' },
  { id: 'aquarela', label: 'Aquarela' },
  { id: 'hq', label: 'HQ · Quadrinho' },
  { id: 'pop-art', label: 'Pop Art' },
  { id: 'esboco', label: 'Esboço a Lápis' },
  { id: 'voce-amarelo', label: 'Você Amarelo' },
  { id: 'guerreiro-espacial', label: 'Guerreiro Espacial' },
  { id: 'anime', label: 'Anime' },
  { id: 'ghibli', label: 'Studio Ghibli' },
];

/** MIME suportados pela Edge; qualquer outro cai em PNG. */
function safeMime(type: string): 'image/png' | 'image/jpeg' {
  return type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
}

/** Blob → base64 SEM o prefixo `data:` (o que a Edge espera). */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/** base64 (sem prefixo) → Blob do MIME dado. */
function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * GeminiEdgeStyleProvider (Trilha 2, ADR-021) — adaptador de style transfer que
 * fala EXCLUSIVAMENTE com a Edge `style-transfer` do próprio Supabase. É
 * PROVIDER-AGNOSTIC: NUNCA conhece a chave nem o endpoint do provedor de IA — a
 * Edge é o proxy que guarda o segredo e ESCOLHE o provedor real (hoje OpenAI,
 * antes Gemini) via `STYLE_PROVIDER`. O cliente só envia a imagem em base64 +
 * parâmetros de estilo, autenticado com `apikey` + `Authorization: Bearer
 * <sessão>` no MESMO padrão do `GenerationGateway`. (O nome histórico "Gemini"
 * permaneceu; o provedor default agora é OpenAI, escolhido no `.env` da Edge.)
 *
 * DESLIGADO por default: `isConfigured()` reflete `APP_CONFIG.styleTransfer
 * .enabled` (injetável; sobreponível em testes). Como o `provideStyleTransfer`
 * só registra este provedor quando o
 * registry está `enabled()`, com a flag `false` esta classe nunca é sequer
 * instanciada — logo nenhum `fetch` à Edge é alcançável e o LOCAL-ONLY do resto
 * do app permanece intacto.
 */
@Injectable({ providedIn: 'root' })
export class GeminiEdgeStyleProvider implements StyleProvider {
  readonly id = 'gemini-edge';
  readonly displayName = 'Estilo com IA';
  readonly requiresNetwork = true as const;

  private readonly config = inject(APP_CONFIG);
  private readonly supabase = inject(SupabaseClientService).client;

  isConfigured(): boolean {
    return this.config.styleTransfer?.enabled ?? false;
  }

  async listStyles(): Promise<readonly StyleOption[]> {
    return GEMINI_STYLES;
  }

  async apply(req: StyleTransferRequest): Promise<StyleTransferResult> {
    const res = await fetch(
      `${this.config.supabaseUrl}/functions/v1/style-transfer`,
      {
        method: 'POST',
        headers: await this.headers(),
        body: JSON.stringify(await this.buildBody(req)),
        signal: req.signal,
      },
    );
    if (!res.ok) {
      const { message, code } = await this.errorInfo(res);
      throw new StyleTransferError(message, code);
    }
    const data = (await res.json()) as {
      image_base64?: string;
      mime_type?: string;
      provider?: string;
      cost_estimate_usd?: number;
    };
    if (!data?.image_base64) {
      throw new Error('Resposta inválida do serviço de estilo com IA.');
    }
    return {
      image: base64ToBlob(data.image_base64, data.mime_type ?? 'image/png'),
      provider: data.provider ?? this.id,
      costEstimateUsd: data.cost_estimate_usd,
    };
  }

  private async buildBody(req: StyleTransferRequest): Promise<unknown> {
    const body: Record<string, unknown> = {
      image_base64: await blobToBase64(req.image),
      mime_type: safeMime(req.image.type),
      style_id: req.styleId,
    };
    if (req.strength != null) {
      body['strength'] = req.strength;
    }
    return body;
  }

  /**
   * Mensagem segura vinda da Edge (`{error}`) + `code` de erro (`{code}`) para a
   * UI diferenciar casos (ex.: `'insufficient_credits'` → filtros inativos com
   * aviso de crédito, em vez de erro genérico). Fallback de mensagem por status.
   */
  private async errorInfo(
    res: Response,
  ): Promise<{ message: string; code?: string }> {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    return {
      message:
        body?.error ?? `Falha no serviço de estilo com IA (HTTP ${res.status}).`,
      code: body?.code,
    };
  }

  /** Headers no padrão do GenerationGateway: apikey + Bearer da sessão. */
  private async headers(): Promise<HeadersInit> {
    const { data } = await this.supabase.auth.getSession();
    const token = data.session?.access_token ?? this.config.supabaseAnonKey;
    return {
      'Content-Type': 'application/json',
      apikey: this.config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    };
  }
}
