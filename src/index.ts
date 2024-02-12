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

const width = window.innerWidth, height = window.innerHeight;

// init

const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 10);
camera.position.z = 2;
camera.position.y = 2;

// make it see super super far
camera.far = 1000;
camera.near = 0.1;
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

const coll2mesh = new Map<string, THREE.Object3D>();
const mesh2Coll = new Map<THREE.Object3D, ShapeContentData>();

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

const channel = geckos({
    url: `${location.protocol}//${location.hostname}`,
    port: 9208
});

interface ShapeContentData {
    id: string;
    type: "cuboid" | "ball" | "polygon" | "line";
    color: number;
    /** 0-1 alpha */
    alpha: number;
    name: string | undefined;
    description: string | undefined;
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
        setName('');
    });

    channel.emit('chat message', 'a short message sent to the server');

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
            if (content.type === "cuboid") {
                let cuboid = content as Cuboid;
                let geometry = new THREE.BoxGeometry(cuboid.width, cuboid.height, cuboid.depth);
                let material = new THREE.MeshStandardMaterial({ color: cuboid.color, transparent: true, opacity: cuboid.alpha });
                obj = new THREE.Mesh(geometry, material);
            } else if (content.type === "ball") {
                let ball = content as Ball;
                let geometry = new THREE.SphereGeometry(ball.radius);
                let material = new THREE.MeshStandardMaterial({ color: ball.color, transparent: true, opacity: ball.alpha });
                obj = new THREE.Mesh(geometry, material);
            } else {
                console.error("unknown shape type: " + content.type);
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

    // filter out the table
    const filtered = intersects.filter((i) => {
        let data = mesh2Coll.get(i.object);
        return data ? data.id !== 'object-0' : true;
    });

    if (intersects.length > 0) {
        const coll = mesh2Coll.get(intersects[0].object);

        if (coll) {
            if (coll.id === 'object-0' || grabbing.length > 0) {
                setName('');
            } else {
                setName(coll.name || '');
            }
            channel.emit('mouseMove', { x: point.x, y: point.y, z: point.z, coll: coll.id });
        } else {
            setName('');
            channel.emit('mouseMove', { x: point.x, y: point.y, z: point.z });
        }

        lastMouseWorldPos = point;
    } else {
        setName('');
        channel.emit('mouseMove', { x: point.x, y: point.y, z: point.z });
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
            if (coll) {
                channel.emit('mouseDown', { x: point.x, y: point.y, z: point.z, coll: coll.id });
            } else {
                channel.emit('mouseDown', { x: point.x, y: point.y, z: point.z });
            }

            lastMouseWorldPos = point;
        } else {
            channel.emit('mouseDown', { x: point.x, y: point.y, z: point.z });
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
                channel.emit('mouseUp', { x: point.x, y: point.y, z: point.z, coll: coll.id });
            } else {
                channel.emit('mouseUp', { x: point.x, y: point.y, z: point.z });
            }
        } else {
            channel.emit('mouseUp', { x: point.x, y: point.y, z: point.z });
        }
    }

    mouseMove(e);
}

document.addEventListener('mouseup', mouseUp);

document.addEventListener('keydown', (e) => {
    // on E, do spawnCuboid at mouse
    if (e.key === 'e') {
        channel.emit('spawnCuboid', { x: lastMouseWorldPos.x, y: lastMouseWorldPos.y, z: lastMouseWorldPos.z });
    }
    // on R, do roll on hover object
    if (e.key === 'r') {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(lastMouseScreenPos, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (intersects.length > 0) {
            const coll = mesh2Coll.get(intersects[0].object);
            if (coll) {
                channel.emit('roll', { coll: coll.id });
                console.log('rolling', coll.id);
            }
        }
    }
});