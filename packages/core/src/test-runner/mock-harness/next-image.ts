/**
 * Mock next/image
 * Returns props passthrough for jsdom rendering.
 */

interface ImageProps {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

function Image(props: ImageProps) {
  return props;
}

export default Image;
