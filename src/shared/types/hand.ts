export interface Point3D {
  x: number;
  y: number;
  z: number;
}

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
