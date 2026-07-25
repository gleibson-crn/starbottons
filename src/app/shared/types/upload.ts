/** Registro de um upload de imagem (espelha a tabela `uploads`). */
export interface UploadRecord {
  /** Id do registro em `uploads` (FK usada por `generate-art`). */
  readonly id: string;
  /** Caminho do objeto no bucket privado `uploads`. */
  readonly path: string;
  /** Nome original do arquivo. */
  readonly fileName: string;
  /** Largura natural da imagem, em px de origem. */
  readonly width: number;
  /** Altura natural da imagem, em px de origem. */
  readonly height: number;
  /** URL local (object URL) para preview no browser. */
  readonly previewUrl: string;
}
