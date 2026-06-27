import * as THREE from "three";

export class ThirdPersonCamera {
  constructor(camera, config) {
    this.camera = camera;
    this.config = config;
    this.reticleNdc = new THREE.Vector3();
    this.reticleWorldPoint = new THREE.Vector3();
  }

  getForward(yaw) {
    return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
  }

  getAimTarget(playerPosition, yaw, pitch = 0) {
    const { targetHeight, aimDistance, downLookAimScale, downLookTargetDrop } = this.config.camera;
    const target = playerPosition.clone();
    const downLookAmount = Math.min(1, Math.max(0, -pitch / (Math.PI / 2)));
    const aimScale = 1 - downLookAmount * (1 - (downLookAimScale ?? 1));
    target.y += targetHeight - downLookAmount * (downLookTargetDrop ?? 0);
    // Looking down should prioritize the ground near the player over keeping the full body framed.
    target.addScaledVector(this.getForward(yaw), (aimDistance ?? 0) * aimScale);
    return target;
  }

  getReticleAimTarget() {
    const screenY = this.config.camera.crosshairY ?? 0.45;
    const aimDistance = this.config.camera.aimRayDistance ?? 180;
    this.reticleNdc.set(0, 1 - screenY * 2, 0.5);
    this.reticleWorldPoint.copy(this.reticleNdc).unproject(this.camera);

    const direction = this.reticleWorldPoint.sub(this.camera.position);
    if (direction.lengthSq() === 0) {
      return this.camera.position.clone();
    }

    direction.normalize();
    return this.camera.position.clone().addScaledVector(direction, aimDistance);
  }

  update(playerPosition, yaw, pitch) {
    const { distance, height, targetHeight, pitchHeightScale, downLookDistanceScale, lerp } = this.config.camera;
    const cameraAnchor = playerPosition.clone();
    cameraAnchor.y += targetHeight;
    const aimTarget = this.getAimTarget(playerPosition, yaw, pitch);
    const forward = this.getForward(yaw);
    const downLookAmount = Math.min(1, Math.max(0, -pitch / (Math.PI / 2)));
    const distanceScale = 1 - downLookAmount * (1 - (downLookDistanceScale ?? 1));
    const horizontalDistance = distance * Math.max(0.62, Math.cos(Math.abs(pitch) * 0.42)) * distanceScale;
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
