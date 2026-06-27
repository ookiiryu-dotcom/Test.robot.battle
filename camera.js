import * as THREE from "three";

export class ThirdPersonCamera {
  constructor(camera, config) {
    this.camera = camera;
    this.config = config;
  }

  getForward(yaw) {
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  }

  getAimTarget(playerPosition, yaw) {
    const { targetHeight, aimDistance } = this.config.camera;
    const target = playerPosition.clone();
    target.y += targetHeight;
    // The camera looks a little ahead of the player so the center reticle is an aim point, not the character body.
    target.addScaledVector(this.getForward(yaw), aimDistance ?? 0);
    return target;
  }

  update(playerPosition, yaw, pitch) {
    const { distance, height, targetHeight, pitchHeightScale, lerp } = this.config.camera;
    const cameraAnchor = playerPosition.clone();
    cameraAnchor.y += targetHeight;
    const aimTarget = this.getAimTarget(playerPosition, yaw);
    const forward = this.getForward(yaw);
    const horizontalDistance = distance * Math.max(0.62, Math.cos(Math.abs(pitch) * 0.42));
    const verticalOffset = height - Math.sin(pitch) * pitchHeightScale;

    // Keep the camera position behind the character body, while the reticle looks at the forward aim point.
    // This avoids zooming into the player when the crosshair target is moved ahead.
    const desiredPosition = new THREE.Vector3(
      cameraAnchor.x - forward.x * horizontalDistance,
      cameraAnchor.y + verticalOffset,
      cameraAnchor.z - forward.z * horizontalDistance
    );

    this.camera.position.lerp(desiredPosition, lerp);
    this.camera.lookAt(aimTarget);
  }
}
