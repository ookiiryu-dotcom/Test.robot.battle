import * as THREE from "three";

export class ThirdPersonCamera {
  constructor(camera, config) {
    this.camera = camera;
    this.config = config;
  }

  update(playerPosition, yaw, pitch) {
    const { distance, height, targetHeight, pitchHeightScale, lerp } = this.config.camera;
    const target = playerPosition.clone();
    target.y += targetHeight;
    const horizontalDistance = distance * Math.max(0.62, Math.cos(Math.abs(pitch) * 0.42));
    const verticalOffset = height - Math.sin(pitch) * pitchHeightScale;

    const desiredPosition = new THREE.Vector3(
      target.x - Math.sin(yaw) * horizontalDistance,
      target.y + verticalOffset,
      target.z - Math.cos(yaw) * horizontalDistance
    );

    this.camera.position.lerp(desiredPosition, lerp);
    this.camera.lookAt(target);
  }
}
