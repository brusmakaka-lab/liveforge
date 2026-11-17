import { safeStorage } from 'electron';
import type { Repository } from '../storage/repository';

export class SecretStore {
  constructor(private readonly repository: Repository) {}
  async set(name: string, value: string): Promise<void> {
    if (!(await safeStorage.isAsyncEncryptionAvailable()))
      throw new Error('El cifrado del sistema no está disponible; no se guardó el secreto');
    const encrypted = await safeStorage.encryptStringAsync(value);
    this.repository.saveSecret(name, encrypted.toString('base64'));
  }
  async get(name: string): Promise<string | undefined> {
    const value = this.repository.secret(name);
    if (!value) return undefined;
    const decrypted = await safeStorage.decryptStringAsync(Buffer.from(value, 'base64'));
    if (decrypted.shouldReEncrypt) await this.set(name, decrypted.result);
    return decrypted.result;
  }
}
