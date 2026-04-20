/**
 * useUpload — single-step photo upload.
 *
 * POST /api/upload with multipart form { file, personId } → { photo }
 */

import { useState, useCallback } from 'react';
import { apiClient, type Photo, type ApiError } from '@app/lib/api';

interface UseUploadResult {
  upload: (file: File, personId: string) => Promise<Photo>;
  uploading: boolean;
  error: ApiError | null;
  reset: () => void;
}

export function useUpload(): UseUploadResult {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const reset = useCallback(() => {
    setUploading(false);
    setError(null);
  }, []);

  const upload = useCallback(async (file: File, personId: string): Promise<Photo> => {
    setUploading(true);
    setError(null);

    try {
      const photo = await apiClient.uploadPhoto(file, personId);
      return photo;
    } catch (e) {
      const err = e as ApiError;
      setError(err);
      throw err;
    } finally {
      setUploading(false);
    }
  }, []);

  return { upload, uploading, error, reset };
}
