import { nativeImage } from 'electron';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';

/** Import a bounded raster copy so rules don't depend on the original file path. */
export async function importAlertImage(file: string): Promise<string> {
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extname(file).toLowerCase()))
    throw new Error('Selecciona una imagen PNG, JPEG o WebP');
  const info = await stat(file);
  if (!info.isFile() || info.size > 10 * 1024 * 1024)
    throw new Error('La imagen debe ser un archivo de hasta 10 MB');
  let image = nativeImage.createFromPath(file);
  if (image.isEmpty()) throw new Error('No se pudo leer la imagen seleccionada');
  const { width, height } = image.getSize();
  if (Math.max(width, height) > 256) image = image.resize(width >= height ? { width: 256 } : { height: 256 });
  const data = image.toPNG();
  if (data.length > 384 * 1024) throw new Error('La imagen importada supera el tamaño permitido');
  return `data:image/png;base64,${data.toString('base64')}`;
}
