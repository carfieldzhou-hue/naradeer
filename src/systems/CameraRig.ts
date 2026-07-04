import * as THREE from 'three';

export class CameraRig {
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly distance = 4.5;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
  ) {}

  snapTo(target: THREE.Vector3, yaw: number, pitch: number): void {
    this.desiredPosition.set(
      target.x + this.distance * Math.cos(pitch) * Math.sin(yaw),
      target.y + this.distance * Math.sin(pitch) + 1.5,
      target.z + this.distance * Math.cos(pitch) * Math.cos(yaw),
    );
    this.camera.position.copy(this.desiredPosition);
    this.lookTarget.copy(target).add(new THREE.Vector3(0, 1.2, 0));
    this.camera.lookAt(this.lookTarget);
  }

  update(delta: number, target: THREE.Vector3, lag: number, yaw: number, pitch: number): void {
    this.desiredPosition.set(
      target.x + this.distance * Math.cos(pitch) * Math.sin(yaw),
      target.y + this.distance * Math.sin(pitch) + 1.5,
      target.z + this.distance * Math.cos(pitch) * Math.cos(yaw),
    );

    const factor = 1 - Math.exp(-delta / Math.max(0.001, lag));
    this.camera.position.lerp(this.desiredPosition, factor);

    this.lookTarget.copy(target).add(new THREE.Vector3(0, 1.2, 0));
    this.camera.lookAt(this.lookTarget);
  }
}
