'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function CameraDialog({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="camera-dialog">
        <DialogTitle>拍摄设备照片</DialogTitle>
        <DialogDescription>
          将完整机身、四个指示灯和条形码放入画面，保持对焦清晰后拍照。
        </DialogDescription>
        {open && <CameraPreview onClose={onClose} onCapture={onCapture} />}
      </DialogContent>
    </Dialog>
  );
}

function CameraPreview({
  onClose,
  onCapture,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let current: MediaStream | undefined;
    setReady(false);
    setError('');
    const timeout = setTimeout(() => {
      cancelled = true;
      current?.getTracks().forEach((track) => track.stop());
      setReady(false);
      setError('相机未能启动，请检查摄像头权限，或用 Chrome / Safari 打开本页重试。');
    }, 20000);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            '当前浏览器无法调用相机。请用 Chrome / Safari 打开 HTTPS 或本机 localhost 页面，也可继续选择照片。',
          );
        current = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
        });
        if (cancelled) {
          current.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = current;
        if (video.current) {
          video.current.srcObject = current;
          await video.current.play();
        }
        clearTimeout(timeout);
      } catch (e) {
        clearTimeout(timeout);
        current?.getTracks().forEach((track) => track.stop());
        if (cancelled) return;
        const name = e instanceof Error ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? '相机权限未开启，请在浏览器中允许使用相机后重新打开拍照。'
            : name === 'NotFoundError'
              ? '没有找到可用摄像头，请连接摄像头或选择已有照片。'
              : name === 'NotReadableError'
                ? '摄像头正在被其他应用占用，请关闭占用应用后重试。'
                : e instanceof Error
                  ? e.message
                  : '相机启动失败，请重试或选择照片。',
        );
      }
    }
    void start();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, [facing]);

  async function capture() {
    const element = video.current;
    if (
      !element ||
      !ready ||
      shooting ||
      !element.videoWidth ||
      !element.videoHeight
    )
      return;
    setShooting(true);
    setError('');
    const canvas = document.createElement('canvas');
    try {
      canvas.width = element.videoWidth;
      canvas.height = element.videoHeight;
      canvas.getContext('2d')!.drawImage(element, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error('拍照失败，请重试。')),
          'image/jpeg',
          0.95,
        ),
      );
      stream.current?.getTracks().forEach((track) => track.stop());
      onCapture(
        new File([blob], `拍照-${Date.now()}.jpg`, { type: 'image/jpeg' }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '拍照失败，请重试。');
    } finally {
      canvas.width = canvas.height = 0;
      setShooting(false);
    }
  }
  return (
    <>
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        className="camera-preview"
        aria-label="摄像头实时画面"
        onLoadedData={() => setReady(true)}
      />
      {error ? (
        <p role="alert" className="camera-error">
          {error}
        </p>
      ) : (
        !ready && <p role="status">正在开启相机，请允许浏览器使用摄像头…</p>
      )}
      <div className="camera-actions">
        <button className="button secondary" onClick={onClose}>
          取消
        </button>
        <button
          className="button secondary"
          disabled={!ready || shooting}
          onClick={() =>
            setFacing(facing === 'environment' ? 'user' : 'environment')
          }
        >
          <RefreshCw size={16} />
          切换镜头
        </button>
        <button
          className="button primary"
          disabled={!ready || shooting || !!error}
          onClick={() => void capture()}
        >
          <Camera size={16} />
          {shooting ? '正在拍照…' : '拍照并识别'}
        </button>
      </div>
    </>
  );
}
