import type { DetailedHTMLProps, HTMLAttributes } from "react";

type AFrameTagProps = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  [key: string]: unknown;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "a-scene": AFrameTagProps;
      "a-assets": AFrameTagProps;
      "a-marker": AFrameTagProps;
      "a-entity": AFrameTagProps;
      "a-box": AFrameTagProps;
      "a-plane": AFrameTagProps;
    }
  }
}
