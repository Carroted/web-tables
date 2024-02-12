// welcome to web-tables, basically Tabletop Simulator but in the browser, multiplayer tabletop physics sandbox thingy
// we use geckos.io, ideally we would use WebTransport but no safari support yet and one of my friends uses safari

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from './OrbitControls';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import geckos from '@geckos.io/client';

const channel = geckos({
	url: `${location.protocol}//${location.hostname}`,
	port: 9208
});

channel.onConnect(error => {
	if (error) {
		console.error(error.message)
		return
	}

	channel.on('chat message', data => {
		console.log(`You got the message "${data}" from server`)
	})

	channel.emit('chat message', 'a short message sent to the server')
});

const width = window.innerWidth, height = window.innerHeight;

// init

const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 10);
camera.position.z = 1;

// make it see super super far
camera.far = 1000;
camera.near = 0.1;
camera.updateProjectionMatrix();
/*
class CameraControls {
	// camera controls
	camera: THREE.PerspectiveCamera;
	orbitPosition: THREE.Vector3;
	constructor(camera: THREE.PerspectiveCamera) {
		this.camera = camera;

		// ok so this is a pretty simple one, it orbits around a point with right click, and pans with middle click or hold Z and move mouse
		// it also zooms with scroll of course
		this.orbitPosition = new THREE.Vector3(0, 0, 0);
		let orbiting = false;
		let panning = false;
		let zooming = false;
		let lastX = 0, lastY = 0;
		let lastZoom = 0;
		let zoomSpeed = 0.001;
		let panSpeed = 0.005;
		let orbitSpeed = 0.01;
		let orbitDistance = 1;
		let orbitYAngle = 0;
		let orbitXAngle = 0;

		const updateCamera = () => {
			this.camera.position.x = this.orbitPosition.x + Math.sin(orbitYAngle) * Math.cos(orbitXAngle) * orbitDistance;
			this.camera.position.y = this.orbitPosition.y + Math.sin(orbitXAngle) * orbitDistance;
			this.camera.position.z = this.orbitPosition.z + Math.cos(orbitYAngle) * Math.cos(orbitXAngle) * orbitDistance;
			this.camera.lookAt(this.orbitPosition);
		};

		const degToRad = (deg: number) => deg * Math.PI / 180;

		document.addEventListener('mousedown', (e) => {
			if (e.button === 2) {
				orbiting = true;
				console.log('orbiting');
			}
			if (e.button === 1) {
				panning = true;
				console.log('panning');
			}
			console.log('mouse down of button ' + e.button);
			e.preventDefault();
		});
		document.addEventListener('mouseup', (e) => {
			if (e.button === 2) {
				orbiting = false;
				console.log('stopped orbiting');
			}
			if (e.button === 1) {
				panning = false;
				console.log('stopped panning');
			}
			e.preventDefault();
		});
		// same for context menu
		document.addEventListener('contextmenu', (e) => {
			e.preventDefault();
		});
		document.addEventListener('mousemove', (e) => {
			if (panning) {
				// same concept, but we need to rotate the movement vector by the camera's rotation, ignoring X rotation
				const cameraRotation = new THREE.Quaternion().setFromEuler(this.camera.rotation);
				// clear everything but Y rotation
				cameraRotation.x = 0;
				cameraRotation.z = 0;
				const movement = new THREE.Vector3((e.clientX - lastX) * panSpeed, 0, (e.clientY - lastY) * panSpeed);
				movement.applyQuaternion(cameraRotation);
				this.orbitPosition.sub(movement);
				updateCamera();
			}
			if (orbiting) {
				orbitYAngle -= (e.clientX - lastX) * orbitSpeed;
				orbitXAngle += (e.clientY - lastY) * orbitSpeed;
				// clamp X angle
				orbitXAngle = Math.max(-Math.PI / 2, Math.min((Math.PI / 2) - 0.01, orbitXAngle));
				// temporary feature, prevent going below X=10deg
				if (orbitXAngle < degToRad(1)) orbitXAngle = degToRad(1);
				updateCamera();
			}
			lastX = e.clientX;
			lastY = e.clientY;

			e.preventDefault();
		});
		document.addEventListener('wheel', (e) => {
			orbitDistance += e.deltaY * zoomSpeed;
			updateCamera();
			e.preventDefault();
		});
		document.addEventListener('keydown', (e) => {
			if (e.key === 'z') {
				panning = true;
			}
		});
		document.addEventListener('keyup', (e) => {
			if (e.key === 'z') {
				panning = false;
			}
		});
	}
}*/

//const cameraControls = new CameraControls(camera);

const controls = new OrbitControls(camera, document.body);
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2;
controls.mouseButtons = {
	LEFT: 1000,
	RIGHT: THREE.MOUSE.ROTATE,
	MIDDLE: THREE.MOUSE.PAN
};
controls.rotateSpeed = 0.2;
controls.panSpeed = 0.7;

function setCursor(cursor: string) {
	document.body.style.cursor = cursor;
}

const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setAnimationLoop(render);
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
composer.addPass(outlinePass);

outlinePass.edgeStrength = 3;

const outputPass = new OutputPass();
composer.addPass(outputPass);

/*
// Create the ground
let groundColliderDesc = RAPIER.ColliderDesc.cuboid(10.0, 0.1, 10.0);
world.createCollider(groundColliderDesc);

// Create a dynamic rigid-body.
let rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
	.setTranslation(0.0, 1.0, 0.0);
let rigidBody = world.createRigidBody(rigidBodyDesc);

// Create a cuboid collider attached to the dynamic rigidBody.
let colliderDesc = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
let collider = world.createCollider(colliderDesc, rigidBody);

// Game loop. Replace by your own game loop system.
let gameLoop = () => {
	// Ste the simulation forward.  
	world.step();

	// Get and print the rigid-body's position.
	let position = rigidBody.translation();
	console.log("Rigid-body position: ", position.x, position.y, position.z);

	setTimeout(gameLoop, 16);
};

gameLoop();*/

const coll2mesh = new Map<RAPIER.ColliderHandle, THREE.Object3D>();
const mesh2RB = new Map<THREE.Object3D, RAPIER.RigidBody>();

function createBox(xw: number, yw: number, zw: number, x: number, y: number, z: number, color: number, isStatic: boolean): {
	mesh: THREE.Mesh,
	meshRB?: RAPIER.RigidBody
} {
	const geometry = new THREE.BoxGeometry(xw, yw, zw);
	const material = new THREE.MeshPhongMaterial({ color: color, shininess: 50, specular: 0x444444 });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.position.set(x, y, z);
	scene.add(mesh);
	const colliderDesc = RAPIER.ColliderDesc.cuboid(xw / 2, yw / 2, zw / 2);
	if (isStatic) {
		const collider = world.createCollider(colliderDesc);
		// set the position of the collider
		collider.setTranslation(new RAPIER.Vector3(x, y, z));

		coll2mesh.set(collider.handle, mesh);

		return { mesh };
	} else {
		const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
			.setTranslation(x, y, z);
		const rigidBody = world.createRigidBody(rigidBodyDesc);
		const collider = world.createCollider(colliderDesc, rigidBody);

		coll2mesh.set(collider.handle, mesh);
		mesh2RB.set(mesh, rigidBody);

		return { mesh, meshRB: rigidBody };
	}
}

async function createGLTF(src: string, x: number, y: number, z: number, isStatic: boolean): Promise<{
	group: THREE.Group,
	groupRB?: RAPIER.RigidBody
}> {
	const loader = new GLTFLoader();
	let group: THREE.Group;
	await new Promise<void>((resolve, reject) => {
		loader.load(src, (gltf) => {
			group = gltf.scene;
			let child: THREE.Mesh = group.children[0] as THREE.Mesh;
			child.scale.set(0.1, 0.1, 0.1);
			group.position.set(x, y, z);
			// tint it
			child.material = new THREE.MeshPhongMaterial({ color: 0xff0000, shininess: 50, specular: 0x444444 });
			child.castShadow = true;
			child.receiveShadow = true;
			scene.add(group);
			const colliderDesc = RAPIER.ColliderDesc.cuboid(0.1, 0.207, 0.1);
			if (isStatic) {
				const collider = world.createCollider(colliderDesc);
				// set the position of the collider
				collider.setTranslation(new RAPIER.Vector3(x, y, z));

				coll2mesh.set(collider.handle, group);
			} else {
				const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
					.setTranslation(x, y, z);
				const rigidBody = world.createRigidBody(rigidBodyDesc);
				const collider = world.createCollider(colliderDesc, rigidBody);

				coll2mesh.set(collider.handle, group);
				// for each object in the gltf, add it to the mesh2RB map
				gltf.scene.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						mesh2RB.set(child, rigidBody);
					}
				});
			}
			resolve();
		});
	});

	return { group: group! }; // typescript doesn't know group is defined
}

let heldObjects: RAPIER.RigidBody[] = [];
let heldObjectJoints: RAPIER.SpringImpulseJoint[] = [];
let heldObjectsStartingYHeight: number = 0;
let heldObjectsCollisionGroups: number[] = [];

let mousePoint = new RAPIER.Vector3(0, 0, 0);



/*
// exact same thing but in createBox
const table = createBox(10, 0.1, 10, 0, -0.2, 0, 0xcccccc, true);
//table.mesh.castShadow = true; - waste of performance, nothing for it to cast a shadow on
table.mesh.receiveShadow = true;
const box = createBox(0.2, 0.2, 0.2, 0, 1, 0, 0xff0000, false);
box.mesh.castShadow = true;
box.mesh.receiveShadow = true;
const box2 = createBox(0.2, 0.2, 0.2, 2, 1, 0, 0xff0000, false);
box2.mesh.castShadow = true;
box2.mesh.receiveShadow = true;

const gltf = await createGLTF('person_web.gltf', 3, 2, 2, false);

box.meshRB?.setRotation(new RAPIER.Quaternion(1, 1, 1, 0.5), true);*/

let hoverBody: RAPIER.RigidBody | null = null;

// when mousemove, raycast and set cursor to pointer if we hit something
function mouseMove(e: MouseEvent) {
	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();
	mouse.x = (e.clientX / width) * 2 - 1;
	mouse.y = - (e.clientY / height) * 2 + 1;
	raycaster.setFromCamera(mouse, camera);
	const intersects = raycaster.intersectObjects(scene.children, true);

	if (intersects.length > 0) {
		const point = intersects[0].point;

		const vec = new RAPIER.Vector3(point.x, heldObjectsStartingYHeight, point.z);

		mousePoint = vec;

		// check if we are hovering over a body
		const rb = mesh2RB.get(intersects[0].object);
		if (rb) {
			hoverBody = rb;
		} else {
			hoverBody = null;
		}
	} else {
		hoverBody = null;
	}

	if (heldObjects.length > 0) {
		return;
	}

	// filter out the table
	const filtered = intersects.filter((i) => i.object !== table.mesh);
	outlinePass.selectedObjects = filtered[0] ? [filtered[0].object] : [];
	if (filtered.length > 0) {
		setCursor('grab');
	} else {
		setCursor('auto');
	}
}

document.addEventListener('mousemove', mouseMove);

// when R is pressed, if hovering over a body, add impulse upward
document.addEventListener('keydown', (e) => {
	if (e.key === 'r' && hoverBody) {
		hoverBody.applyImpulse(new RAPIER.Vector3(0, 0.02, 0), true);
	}
});

function quaternionToEuler(q: RAPIER.Quaternion): RAPIER.Vector3 {
	// no built in methods for this, so we have to do it manually
	// roll (x-axis rotation)
	let sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
	let cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
	let x = Math.atan2(sinr_cosp, cosr_cosp);

	// pitch (y-axis rotation)
	let sinp = 2 * (q.w * q.y - q.z * q.x);
	let y = 0;
	if (Math.abs(sinp) >= 1) {
		y = Math.sign(sinp) * Math.PI / 2; // use 90 degrees if out of range
	} else {
		y = Math.asin(sinp);
	}

	// yaw (z-axis rotation)
	let siny_cosp = 2 * (q.w * q.z + q.x * q.y);
	let cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z);
	let z = Math.atan2(siny_cosp, cosy_cosp);

	let euler = new RAPIER.Vector3(x, y, z);

	return euler;
}

// when scroll while holding objects, spin it
document.addEventListener('wheel', (e) => {
	if (heldObjects.length > 0) {
		for (let rb of heldObjects) {
			rb.applyTorqueImpulse(new RAPIER.Vector3(0, e.deltaY * 0.00001, 0), true);
		}
	}
});

document.addEventListener('mousedown', (e) => {
	outlinePass.selectedObjects = [];
	if (e.button === 0) {
		const raycaster = new THREE.Raycaster();
		const mouse = new THREE.Vector2();
		mouse.x = (e.clientX / width) * 2 - 1;
		mouse.y = - (e.clientY / height) * 2 + 1;
		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObjects(scene.children, true);
		// filter out the table
		const filtered = intersects.filter((i) => i.object !== table.mesh);
		if (filtered.length > 0) {
			const rb = mesh2RB.get(filtered[0].object);
			if (rb) {
				// get all colliders
				let colliderCount = rb.numColliders();
				let colliders: RAPIER.Collider[] = [];
				for (let i = 0; i < colliderCount; i++) {
					colliders.push(rb.collider(i));
				}
				let collisionGroup = 0;
				// set their collision groups to 0
				for (let collider of colliders) {
					collisionGroup = collider.collisionGroups();
					collider.setCollisionGroups(0);
				}
				rb.setLinearDamping(100);
				rb.setAngularDamping(100);
				rb.setGravityScale(0, true);
				rb.setRotation(RAPIER.RotationOps.identity(), true);
				heldObjects.push(rb);
				heldObjectsCollisionGroups.push(collisionGroup);
				// create a joint
				/*const joint = new RAPIER.SpringImpulseJoint(
					// rawset
					new RAPIER.Vector3(0, 0, 0),
					rb,

				);*/
				//let params = RAPIER.JointData.spring(0, 5, 1, new RAPIER.Vector3(0, 0, 0), new RAPIER.Vector3(0, 0, 0));
				//let joint = world.createImpulseJoint(params, rb, mouseBody, true);
				//heldObjectJoints.push(joint);
				heldObjectsStartingYHeight = rb.translation().y + 1;

				outlinePass.selectedObjects = [filtered[0].object];
			}
		}
	}

	if (heldObjects.length > 0) {
		setCursor('grabbing');
		outlinePass.visibleEdgeColor.set(1, 1, 0);
		outlinePass.hiddenEdgeColor.set(1, 1, 0);
		controls.enableZoom = false;
	}
});

document.addEventListener('mouseup', (e) => {
	if (e.button === 0) {
		// reset linear damping
		for (let rb of heldObjects) {
			rb.setLinearDamping(0);
			rb.setAngularDamping(0);
			// get all colliders
			let colliderCount = rb.numColliders();
			let colliders: RAPIER.Collider[] = [];
			for (let i = 0; i < colliderCount; i++) {
				colliders.push(rb.collider(i));
			}

			// set their collision groups to 1
			for (let collider of colliders) {
				collider.setCollisionGroups(heldObjectsCollisionGroups.shift() || 1);
			}

			rb.setGravityScale(1, true);
		}
		heldObjects = [];
		// clear heldObjectJoints
		for (let joint of heldObjectJoints) {
			world.removeImpulseJoint(joint, true);
		}
		heldObjectJoints = [];

		controls.enableZoom = true;
	}

	mouseMove(e);

	outlinePass.visibleEdgeColor.set(1, 1, 1);
	outlinePass.hiddenEdgeColor.set(1, 1, 1);
});

// now we add some lighting :3
scene.add(new THREE.AmbientLight(0xcccccc));

const spotLight = new THREE.SpotLight(0xffffff, 60);
spotLight.angle = Math.PI / 5;
spotLight.penumbra = 0.2;
spotLight.position.set(2, 3, 3);
spotLight.castShadow = true;
spotLight.shadow.camera.near = 0.1;
spotLight.shadow.camera.far = 100;
spotLight.shadow.mapSize.width = 1024;
spotLight.shadow.mapSize.height = 1024;
spotLight.shadow.camera.visible = true;
scene.add(spotLight);

const dirLight = new THREE.DirectionalLight(0x55505a, 3);
dirLight.position.set(0, 3, 0);
dirLight.castShadow = true;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 100;

dirLight.shadow.camera.right = 1;
dirLight.shadow.camera.left = - 1;
dirLight.shadow.camera.top = 1;
dirLight.shadow.camera.bottom = - 1;
dirLight.shadow.camera.visible = true;

dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

function resizeRendererToDisplaySize(renderer: THREE.WebGLRenderer) {
	const canvas = renderer.domElement;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;
	const needResize = canvas.width !== width || canvas.height !== height;
	if (needResize) {
		renderer.setSize(width, height, false);
		composer.setSize(width, height);
	}
	return needResize;
}

function render(time: number) {

	if (resizeRendererToDisplaySize(renderer)) {
		const canvas = renderer.domElement;
		camera.aspect = canvas.clientWidth / canvas.clientHeight;
		camera.updateProjectionMatrix();
	}

	//renderer.render(scene, camera);
	composer.render();

}