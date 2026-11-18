/**
 * ModalService — diálogos do sistema. A implementação vive em
 * `shared/ui/modal-host` (o host em `shared/` não pode depender de `core/`,
 * regra `shared-nao-importa-core`); aqui é reexportada como API de core.
 */
export { ModalService } from '../../shared/ui/modal-host/modal.service';
export type {
  AlertOptions,
  ChoicesOptions,
  ConfirmOptions,
  ModalChoice,
  ModalVariant,
} from '../../shared/ui/modal-host/modal.service';
