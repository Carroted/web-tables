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
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

const width = window.innerWidth, height = window.innerHeight;

// init

const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 10);
camera.position.z = 2;
camera.position.y = 2;

// make it see super super far
camera.far = 50;
camera.near = 0.01;
camera.updateProjectionMatrix();

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
renderer.shadowMap.enabled = true;
renderer.setAnimationLoop(render);
document.body.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const hdriLoader = new RGBELoader()
hdriLoader.load('./sky.hdr', function (texture) {
    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
    texture.dispose();
    scene.environment = envMap;
    scene.background = envMap;
    console.log('set envmap');
});

const composer = new EffectComposer(renderer);

const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
composer.addPass(outlinePass);

outlinePass.edgeStrength = 3;

const outputPass = new OutputPass();
composer.addPass(outputPass);

const coll2mesh = new Map<string, THREE.Object3D>();
const mesh2Coll = new Map<THREE.Object3D, ShapeContentData>();
let controlObject: THREE.Object3D | null = null;

// now we add some lighting :3
//scene.add(new THREE.AmbientLight(0xcccccc));

const pointLight = new THREE.PointLight(0xffffff, 60);
pointLight.position.set(0, 3, 0);
pointLight.castShadow = true;

scene.add(pointLight);

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

const channel = geckos({
    url: `${location.protocol}//${location.hostname}`,
    port: 9208
});

interface ShapeContentData {
    id: string;
    name: string | undefined;
    description: string | undefined;
    type: "cuboid" | "ball" | "polygon" | "line";
    color: number;
    /** 0-1 alpha */
    alpha: number;
    model: string | null;
    modelScale: number | null;
    modelOffset: { x: number, y: number, z: number } | null;
    interactive: boolean;
}

interface CollisionSound {
    sound: string;
    volume: number;
}

interface Cuboid extends ShapeContentData {
    type: "cuboid";
    width: number;
    height: number;
    depth: number;
}

interface Ball extends ShapeContentData {
    type: "ball";
    radius: number;
}

/** Translation and rotation to apply to a shape. Scale is not included in this (and is instead in `ShapeContentData`) since it rarely changes, unlike position and rotation, which usually change every frame. */
interface ShapeTransformData {
    x: number;
    y: number;
    z: number;
    rotation: {
        x: number;
        y: number;
        z: number;
        w: number;
    };
}

interface PhysicsStepInfo {
    delta: {
        /** Shape content that has changed since last step. */
        shapeContent: { [id: string]: ShapeContentData };

        /** New positioning and rotation of shape contents. */
        shapeTransforms: { [id: string]: ShapeTransformData };

        /** IDs of shape contents that are no more. */
        removedContents: string[];
    };

    ms: number;

    sounds: CollisionSound[];
}

let loadingCover: HTMLDivElement = document.getElementById('loading') as HTMLDivElement;
let loading = true;
let loadingSpinner = loadingCover.querySelector('.spinner') as HTMLDivElement;
let loadingStatus = loadingCover.querySelector('.status') as HTMLDivElement; // hidden by default, shows errors

let nameText = document.getElementById('name') as HTMLDivElement;

function setName(name: string) {
    nameText.textContent = name;
    if (name === '') {
        nameText.style.display = 'none';
    } else {
        nameText.style.display = 'block';
    }
}

let me: { id: string, color: number } | undefined;
let grabbing: string[] = [];

let lastClientX = 0;
let lastClientY = 0;

let packetBuffer: {
    event: string,
    data: any
}[] = [];

function emit(event: string, data: any) {
    packetBuffer.push({
        event,
        data
    });
}

channel.onConnect(error => {
    if (error) {
        console.error(error.message);
        let message = error.message;
        if (error.message === 'Failed to fetch') {
            message = 'Server is unreachable! CTRL+Shift+R to retry.';
        }
        loadingStatus.textContent = message;
        loadingSpinner.style.display = 'none';
        loadingStatus.style.display = 'block';
        return
    }

    // 40fps
    setInterval(() => {
        for (let packet of packetBuffer) {
            channel.emit(packet.event, packet.data);
        }
        packetBuffer = [];
    }, 20);

    emit('joinRoom', 'zone');

    channel.on('me', data => {
        let meData = data as { id: string, color: number };
        // if theres a 'cursor-<id>' object, remove it
        let cursor = coll2mesh.get('cursor-' + meData.id);
        if (cursor) {
            scene.remove(cursor);
            coll2mesh.delete('cursor-' + meData.id);
        }
        me = meData;
    });

    channel.on('chat message', data => {
        console.log(`You got the message "${data}" from server`);
    })

    channel.on('grabbing', data => {
        grabbing = data as string[];
        // get all the objects that are being grabbed
        let objects = grabbing.map(id => coll2mesh.get(id)).filter(obj => obj) as THREE.Object3D[];
        outlinePass.selectedObjects = objects;
        setCursor('grabbing');
        outlinePass.visibleEdgeColor.set(1, 1, 0);
        outlinePass.hiddenEdgeColor.set(1, 1, 0);
        controls.enableZoom = false;
        setName('');
    });

    channel.on('controlling', data => {
        let control = data as string;
        let controlObj = coll2mesh.get(control);
        controlObject = controlObj ? controlObj : null;
        if (controlObj) {
            controls.enablePan = false;
            controls.target = controlObj.position;
            controls.maxDistance = 3;
            //controls.cursor = controlObj.position;
            controls.update();
        }
    });

    emit('chat message', 'a short message sent to the server');

    channel.on('physicsStep', data => {
        if (loading) {
            loadingCover.style.display = 'none';
            loading = false;
        }

        // data is a PhysicsStepInfo
        let stepInfo = data as PhysicsStepInfo;

        // for all the changed shape contents and removed contents, if in coll2mesh, destroy existing
        for (let id of stepInfo.delta.removedContents) {
            let obj = coll2mesh.get(id);
            if (obj) {
                scene.remove(obj);
                coll2mesh.delete(id);
                mesh2Coll.delete(obj);
            }
        }
        // same for changed shape contents (we will re-add them later)
        for (let id in stepInfo.delta.shapeContent) {
            let obj = coll2mesh.get(id);
            if (obj) {
                scene.remove(obj);
                coll2mesh.delete(id);
                mesh2Coll.delete(obj);
            }
        }

        // for all the changed shape contents, if not in coll2mesh, create new
        for (let id in stepInfo.delta.shapeContent) {
            let content = stepInfo.delta.shapeContent[id];
            if (id === 'cursor-' + me?.id) {
                continue;
            }
            let obj: THREE.Object3D;
            if (!content.model) {
                if (content.type === "cuboid") {
                    let cuboid = content as Cuboid;
                    let geometry = new THREE.BoxGeometry(cuboid.width, cuboid.height, cuboid.depth);
                    let material = new THREE.MeshStandardMaterial({ color: cuboid.color, });
                    obj = new THREE.Mesh(geometry, material);
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                } else if (content.type === "ball") {
                    let ball = content as Ball;
                    let geometry = new THREE.SphereGeometry(ball.radius);
                    let material = new THREE.MeshStandardMaterial({ color: ball.color, });
                    obj = new THREE.Mesh(geometry, material);
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                } else {
                    console.error("unknown shape type: " + content.type);
                    continue;
                }
            } else {
                let loader = new GLTFLoader();
                loader.load(content.model, (gltf) => {
                    let obj = gltf.scene;
                    if (content.modelScale) {
                        obj.scale.set(content.modelScale, content.modelScale, content.modelScale);
                    }


                    coll2mesh.set(id, obj);
                    mesh2Coll.set(obj, content);
                    console.log('added', obj, 'with id', id);
                    scene.add(obj);
                    // traverse, set all in mesh2Coll
                    obj.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            if (content.modelOffset) {
                                child.position.set(content.modelOffset.x, content.modelOffset.y, content.modelOffset.z);
                            }
                            child.material = new THREE.MeshStandardMaterial({
                                roughness: 0.5,
                                color: content.color
                            });
                            child.castShadow = true;
                            child.receiveShadow = true;
                            mesh2Coll.set(child, content);
                        }
                    });
                });
                continue;
            }
            coll2mesh.set(id, obj);
            mesh2Coll.set(obj, content);
            console.log('added', obj, 'with id', id);
            scene.add(obj);
        }

        // now for all the changed shape contents, update their transforms
        for (let id in stepInfo.delta.shapeTransforms) {
            let obj = coll2mesh.get(id);
            if (obj) {
                let transform = stepInfo.delta.shapeTransforms[id];
                // if its controlObject, we have to get its delta and apply it to camera
                if (controlObject === obj) {
                    let delta = new THREE.Vector3();
                    delta.x = transform.x - obj.position.x;
                    delta.y = transform.y - obj.position.y;
                    delta.z = transform.z - obj.position.z;
                    camera.position.add(delta);
                    //controls.update();
                }
                obj.position.set(transform.x, transform.y, transform.z);
                obj.setRotationFromQuaternion(new THREE.Quaternion(transform.rotation.x, transform.rotation.y, transform.rotation.z, transform.rotation.w));
            }
        }



        mouseMove({ clientX: lastClientX, clientY: lastClientY, preventDefault: () => { } });

    });
});

channel.onDisconnect(() => {
    console.log('You have been disconnected');
    loadingCover.style.display = 'flex';
    loadingStatus.textContent = 'You have been disconnected';
    loadingSpinner.style.display = 'none';
    loadingStatus.style.display = 'block';
});

document.addEventListener('wheel', (e) => {
    if (grabbing.length > 0) {
        emit('scroll', e.deltaY * 0.00001);
    }
});

let lastMouseWorldPos = { x: 0, y: 0, z: 0 };
let lastMouseScreenPos: THREE.Vector2;

// when mousemove, raycast and set cursor to pointer if we hit something
function mouseMove(e: {
    clientX: number;
    clientY: number;
    preventDefault: () => void;
}) {
    lastClientX = e.clientX;
    lastClientY = e.clientY;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    mouse.x = (e.clientX / width) * 2 - 1;
    mouse.y = - (e.clientY / height) * 2 + 1;
    lastMouseScreenPos = mouse;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    let point: THREE.Vector3 = new THREE.Vector3();
    let ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    raycaster.ray.intersectPlane(ground, point);

    // filter out uninterractive objects
    const filtered = intersects.filter((i) => {
        let data = mesh2Coll.get(i.object);
        return data?.interactive;
    });

    if (intersects.length > 0) {
        const coll = mesh2Coll.get(intersects[0].object);

        if (coll) {
            if (!coll.interactive || grabbing.length > 0) {
                setName('');
            } else {
                setName(coll.name || '');
            }
            emit('mouseMove', { x: point.x, y: point.y, z: point.z, coll: coll.id });
        } else {
            setName('');
            emit('mouseMove', { x: point.x, y: point.y, z: point.z });
        }

        lastMouseWorldPos = point;
    } else {
        setName('');
        emit('mouseMove', { x: point.x, y: point.y, z: point.z });
    }

    if (grabbing.length === 0) {

        outlinePass.selectedObjects = filtered[0] ? [filtered[0].object] : [];
        if (filtered.length > 0) {
            setCursor('grab');
        } else {
            setCursor('auto');
        }
    }

    nameText.style.left = e.clientX + 10 + 'px';
    nameText.style.top = e.clientY + 10 + 'px';
}

document.addEventListener('mousemove', mouseMove);

// when mouse down, if we hit something, tell server :3
function mouseDown(e: MouseEvent) {
    if (e.button === 0) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        mouse.x = (e.clientX / width) * 2 - 1;
        mouse.y = - (e.clientY / height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        let point: THREE.Vector3 = new THREE.Vector3();
        let ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        raycaster.ray.intersectPlane(ground, point);

        if (intersects.length > 0) {
            const coll = mesh2Coll.get(intersects[0].object);
            if (coll && coll.interactive) {
                emit('mouseDown', { x: point.x, y: point.y, z: point.z, coll: coll.id });
            } else {
                emit('mouseDown', { x: point.x, y: point.y, z: point.z });
            }

            lastMouseWorldPos = point;
        } else {
            emit('mouseDown', { x: point.x, y: point.y, z: point.z });
        }
    }
}

document.addEventListener('mousedown', mouseDown);

// when mouse up, if we hit something, tell server :3
function mouseUp(e: MouseEvent) {
    grabbing = [];
    outlinePass.visibleEdgeColor.set(1, 1, 1);
    outlinePass.hiddenEdgeColor.set(1, 1, 1);

    if (e.button === 0) {
        controls.enableZoom = true;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        mouse.x = (e.clientX / width) * 2 - 1;
        mouse.y = - (e.clientY / height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        let point: THREE.Vector3 = new THREE.Vector3();
        let ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        raycaster.ray.intersectPlane(ground, point);

        if (intersects.length > 0) {
            const coll = mesh2Coll.get(intersects[0].object);
            if (coll) {
                emit('mouseUp', { x: point.x, y: point.y, z: point.z, coll: coll.id });
            } else {
                emit('mouseUp', { x: point.x, y: point.y, z: point.z });
            }
        } else {
            emit('mouseUp', { x: point.x, y: point.y, z: point.z });
        }
    }

    mouseMove(e);
}

document.addEventListener('mouseup', mouseUp);

document.addEventListener('keydown', (e) => {
    // on E, do spawnCuboid at mouse
    if (e.key === 'e') {
        emit('spawnCuboid', { x: lastMouseWorldPos.x, y: lastMouseWorldPos.y, z: lastMouseWorldPos.z });
    }
    // on R, do roll on hover object
    if (e.key === 'r') {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(lastMouseScreenPos, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            const coll = mesh2Coll.get(intersects[0].object);
            if (coll && coll.interactive) {
                emit('roll', { coll: coll.id });
                console.log('rolling', coll.id);
            }
        }
    }
    // cool new feature just dropped omg, C to Control an objet, as in you get to WASD it around omg and even space to jump and it faces the mouse omg
    if (e.key === 'c') {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(lastMouseScreenPos, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            const coll = mesh2Coll.get(intersects[0].object);
            if (coll && coll.interactive) {
                emit('control', { coll: coll.id });
                console.log('sent controlling up', coll.id);
            }
        }
    }
    if (e.key === 'Escape') {
        e.preventDefault();
        emit('uncontrol', {});
        controls.enablePan = true;
        controlObject = null;
        controls.maxDistance = Infinity;
        controls.target = new THREE.Vector3();
        controls.update();
    }

    if (e.key === 'w') {
        emit('controlKeyDown', 'w');
    }
    if (e.key === 'a') {
        emit('controlKeyDown', 'a');
    }
    if (e.key === 's') {
        emit('controlKeyDown', 's');
    }
    if (e.key === 'd') {
        emit('controlKeyDown', 'd');
    }
    if (e.key === ' ') {
        emit("controlJump", {});
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'w') {
        emit('controlKeyUp', 'w');
    }
    if (e.key === 'a') {
        emit('controlKeyUp', 'a');
    }
    if (e.key === 's') {
        emit('controlKeyUp', 's');
    }
    if (e.key === 'd') {
        emit('controlKeyUp', 'd');
    }
});

controls.addEventListener('change', () => {
    let vector = new THREE.Vector3();
    camera.getWorldDirection(vector);
    let theta = Math.atan2(vector.x, vector.z);
    theta += 90 * Math.PI / 180;

    emit('camRotation', {
        x: 0,
        y: Math.sin(theta / 2),
        z: 0,
        w: Math.cos(theta / 2)
    });
});
