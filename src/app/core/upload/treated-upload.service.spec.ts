import { TestBed } from '@angular/core/testing';
import type { ImageFilters, UploadRecord } from '../../shared/types';
import { UploadService } from './upload.service';
import { TreatedUploadService } from './treated-upload.service';
import type { FilterSource } from './treated-image';

const VIVID: ImageFilters = {
  brightness: 1,
  contrast: 1.15,
  saturate: 1.4,
  effect: 'none',
};

const RECORD = { id: 'treated-1' } as UploadRecord;

const source = { naturalWidth: 3000, naturalHeight: 2000 } as unknown as
  CanvasImageSource & FilterSource;

function fakeCanvas(): HTMLCanvasElement {
  const ctx = { filter: '', drawImage: () => undefined };
  return {
    width: 0,
    height: 0,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    toBlob: (cb: (b: Blob | null) => void) =>
      cb(new Blob(['png'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement;
}

describe('TreatedUploadService', () => {
  let upload: ReturnType<typeof vi.fn>;
  let service: TreatedUploadService;

  beforeEach(() => {
    upload = vi.fn().mockResolvedValue(RECORD);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:treated');
    TestBed.configureTestingModule({
      providers: [
        TreatedUploadService,
        { provide: UploadService, useValue: { upload } },
      ],
    });
    service = TestBed.inject(TreatedUploadService);
  });

  it('sobe um NOVO upload PNG em resolução natural (Abordagem A)', async () => {
    const record = await service.createTreatedUpload(
      source,
      VIVID,
      'foto.jpg',
      fakeCanvas,
    );

    expect(record).toBe(RECORD);
    expect(upload).toHaveBeenCalledTimes(1);
    const [file, probe] = upload.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe('image/png');
    expect((file as File).name).toBe('foto-tratado.png');
    expect(probe).toEqual({
      width: 3000,
      height: 2000,
      previewUrl: 'blob:treated',
    });
  });
});
