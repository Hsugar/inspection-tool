export interface CameraRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Keep the entire sensor frame visible and anchor the guide to that frame. */
export function cameraLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): { image: CameraRect; guide: CameraRect } | null {
  if (
    ![containerWidth, containerHeight, imageWidth, imageHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;

  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const left = (containerWidth - width) / 2;
  const top = (containerHeight - height) / 2;
  // A tall envelope holds both the tube/barcode and the complete device body.
  const guideHeight = Math.min(height * 0.84, (width * 0.74) / 0.42);
  const guideWidth = guideHeight * 0.42;
  return {
    image: { left, top, width, height },
    guide: {
      left: left + (width - guideWidth) / 2,
      top: top + (height - guideHeight) / 2,
      width: guideWidth,
      height: guideHeight,
    },
  };
}
