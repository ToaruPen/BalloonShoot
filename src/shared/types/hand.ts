export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Hand landmarks are normalized to the source frame.
 * Origin is the top-left of the image, x increases to the right, y increases downward,
 * and z follows the tracker depth convention where smaller values are closer to the camera.
 */
export interface HandFrame {
  width: number;
  height: number;
  landmarks: {
    wrist: Point3D;
    indexTip: Point3D;
    indexMcp: Point3D;
    thumbTip: Point3D;
    thumbIp: Point3D;
    middleTip: Point3D;
    ringTip: Point3D;
    pinkyTip: Point3D;
  };
}
