import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LightProbeGrid } from 'three/addons/lighting/LightProbeGrid.js';
import { createWorldSettings, createWorld, addBroadphaseLayer, addObjectLayer, enableCollision, registerAll, updateWorld, rigidBody, box, MotionType } from 'crashcat';
import { Vehicle, MAX_SPEED } from './Vehicle.js';
import { Camera } from './Camera.js';
import { Controls } from './Controls.js';
import { buildTrack, computeTrackBounds } from './Track.js';
import { buildWallColliders, createSphereBody } from './Physics.js';
import { SmokeTrails } from './Particles.js';
import { DriftMarks } from './DriftMarks.js';
import { GameAudio } from './Audio.js';
import { ColorMapGLTFLoader } from './Loader.js';
import { COURSES, getCourse, loopToCells, TrackPath } from './TrackPath.js';
import { Effects } from './Effects.js';
import { Items } from './Items.js';
import { AIDriver } from './AIDriver.js';
import { HUD, formatTime } from './HUD.js';
import { Sfx } from './Sfx.js';

const LAPS = 3;
const params = new URLSearchParams( location.search );
const DEMO = params.has( 'demo' ); // player on autopilot
const COURSE = getCourse( params.get( 'course' ) );
const COUNTDOWN = 3;

const PLAYER = { name: 'YOU', model: 'vehicle-truck-yellow', tint: null, color: '#ffd23a' };

const OPPONENTS = [
	{ name: '썬더', model: 'vehicle-truck-red', tint: null, color: '#e53935' },
	{ name: '바이퍼', model: 'vehicle-truck-green', tint: null, color: '#43a047' },
	{ name: '네온', model: 'vehicle-truck-purple', tint: null, color: '#9c5bd6' },
	{ name: '블레이즈', model: 'vehicle-truck-red', tint: '#ffb066', color: '#ff7f2a' },
	{ name: '코멧', model: 'vehicle-truck-green', tint: '#77d6ff', color: '#26a69a' },
	{ name: '피닉스', model: 'vehicle-truck-purple', tint: '#ff9ad5', color: '#e86ab5' },
	{ name: '스톰', model: 'vehicle-truck-purple', tint: '#7d95ff', color: '#4a63d9' },
	{ name: '라임', model: 'vehicle-truck-green', tint: '#ffff70', color: '#9ccc3c' },
	{ name: '섀도우', model: 'vehicle-truck-red', tint: '#808080', color: '#8b2b2b' },
	{ name: '제트', model: 'vehicle-truck-yellow', tint: '#f2f2f2', color: '#e8e1c8' },
];

// ─── Renderer & scene ─────────────────────────────────────

const renderer = new THREE.WebGLRenderer( { antialias: true, outputBufferType: THREE.HalfFloatType } );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const bloomPass = new UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ) );
bloomPass.strength = 0.08;
bloomPass.radius = 0.1;
bloomPass.threshold = 0.6;
renderer.setEffects( [ bloomPass ] );

document.body.appendChild( renderer.domElement );

const scene = new THREE.Scene();
scene.background = new THREE.Color( COURSE.theme.sky );
scene.fog = new THREE.Fog( COURSE.theme.sky, 30, 55 );

const dirLight = new THREE.DirectionalLight( COURSE.theme.light, COURSE.theme.lightIntensity );
dirLight.position.set( 11.4, 15, - 5.3 );
dirLight.castShadow = true;
dirLight.shadow.mapSize.setScalar( 4096 );
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 60;
dirLight.shadow.radius = 4;
scene.add( dirLight );

const hemiLight = new THREE.HemisphereLight( COURSE.theme.hemiSky, COURSE.theme.hemiGround, 2 );
hemiLight.position.copy( dirLight.position );
scene.add( hemiLight );

window.addEventListener( 'resize', () => renderer.setSize( window.innerWidth, window.innerHeight ) );

// ─── Assets ───────────────────────────────────────────────

const loader = new ColorMapGLTFLoader();

const modelNames = [
	'vehicle-truck-yellow', 'vehicle-truck-green', 'vehicle-truck-purple', 'vehicle-truck-red',
	'track-straight', 'track-corner', 'track-bump', 'track-finish',
	'decoration-empty', 'decoration-forest', 'decoration-tents',
];

const models = {};

function loadModels() {

	return Promise.all( modelNames.map( ( name ) => new Promise( ( resolve, reject ) => {

		loader.load( `models/${ name }.glb`, ( gltf ) => {

			const meshes = [];
			gltf.scene.traverse( ( child ) => {

				if ( child.isMesh ) {

					child.material.side = THREE.FrontSide;
					meshes.push( child );

				}

			} );

			// Godot imports vehicle models at root_scale=0.5
			if ( name.startsWith( 'vehicle-' ) ) gltf.scene.scale.setScalar( 0.5 );

			if ( meshes.length === 1 ) {

				const mesh = meshes[ 0 ];
				mesh.removeFromParent();
				models[ name ] = mesh;

			} else {

				models[ name ] = gltf.scene;

			}

			resolve();

		}, undefined, reject );

	} ) ) );

}

function makeLabel( text, color, isPlayer ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = 256;
	canvas.height = 64;
	const ctx = canvas.getContext( '2d' );
	ctx.font = '800 34px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
	const w = Math.min( 240, ctx.measureText( text ).width + 34 );
	ctx.fillStyle = isPlayer ? 'rgba(255,210,58,0.95)' : 'rgba(20,22,32,0.7)';
	ctx.beginPath();
	ctx.roundRect( 128 - w / 2, 8, w, 46, 23 );
	ctx.fill();
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc( 128 - w / 2 + 20, 31, 7, 0, Math.PI * 2 );
	if ( ! isPlayer ) ctx.fill();
	ctx.fillStyle = isPlayer ? '#1a1a1a' : '#fff';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText( text, 128 + ( isPlayer ? 0 : 8 ), 33 );

	const tex = new THREE.CanvasTexture( canvas );
	tex.colorSpace = THREE.SRGBColorSpace;
	const sprite = new THREE.Sprite( new THREE.SpriteMaterial( { map: tex, depthTest: false, transparent: true } ) );
	sprite.scale.set( 2.0, 0.5, 1 );
	sprite.position.y = 1.35;
	sprite.renderOrder = 20;
	return sprite;

}

// ─── Course picker ────────────────────────────────────────

function courseUrl( id ) {

	const p = new URLSearchParams( location.search );
	p.set( 'course', id );
	p.delete( 'demo' );
	return '?' + p.toString();

}

// Track outline in the same 45° view the game camera uses
function drawCoursePreview( canvas, loop, color ) {

	const ctx = canvas.getContext( '2d' );
	const pts = new TrackPath( loop ).points.map( ( p ) => [ ( p.x - p.z ) / Math.SQRT2, ( p.x + p.z ) / Math.SQRT2 ] );
	const us = pts.map( ( p ) => p[ 0 ] ), vs = pts.map( ( p ) => p[ 1 ] );
	const minU = Math.min( ...us ), maxU = Math.max( ...us ), minV = Math.min( ...vs ), maxV = Math.max( ...vs );
	const pad = 12;
	const scale = Math.min( ( canvas.width - pad * 2 ) / ( maxU - minU ), ( canvas.height - pad * 2 ) / ( maxV - minV ) );
	const toXY = ( [ u, v ] ) => [ canvas.width / 2 + ( u - ( minU + maxU ) / 2 ) * scale, canvas.height / 2 + ( v - ( minV + maxV ) / 2 ) * scale ];

	ctx.lineJoin = 'round';
	ctx.beginPath();
	pts.forEach( ( p, i ) => {

		const [ x, y ] = toXY( p );
		if ( i === 0 ) ctx.moveTo( x, y );
		else ctx.lineTo( x, y );

	} );
	ctx.closePath();
	ctx.strokeStyle = color;
	ctx.lineWidth = 5;
	ctx.stroke();

	const [ fx, fy ] = toXY( pts[ 0 ] );
	ctx.fillStyle = '#fff';
	ctx.beginPath();
	ctx.arc( fx, fy, 4, 0, Math.PI * 2 );
	ctx.fill();

}

{

	const picker = document.getElementById( 'course-picker' );

	for ( const c of COURSES ) {

		const card = document.createElement( c === COURSE ? 'div' : 'a' );
		card.className = 'course' + ( c === COURSE ? ' selected' : '' );
		if ( c !== COURSE ) card.href = courseUrl( c.id );

		const canvas = document.createElement( 'canvas' );
		canvas.width = 120;
		canvas.height = 80;
		drawCoursePreview( canvas, c.loop, c === COURSE ? '#ffcc33' : 'rgba(255,255,255,0.7)' );

		const sky = '#' + new THREE.Color( c.theme.sky ).getHexString();
		card.style.setProperty( '--sky', sky );
		card.append( canvas );
		card.insertAdjacentHTML( 'beforeend', `<b>${ c.name }</b><small>${ c.desc }</small>` );
		picker.appendChild( card );

	}

}

// ─── Game ─────────────────────────────────────────────────

async function init() {

	registerAll();
	await loadModels();

	const cells = loopToCells( COURSE.loop );
	const path = new TrackPath( COURSE.loop );

	const bounds = computeTrackBounds( cells );
	const hw = bounds.halfWidth;
	const hd = bounds.halfDepth;
	const groundSize = Math.max( hw, hd ) * 2 + 20;

	// The light follows the player, so the shadow frustum only needs to cover the view
	const shadowExtent = 32;
	dirLight.shadow.camera.left = - shadowExtent;
	dirLight.shadow.camera.right = shadowExtent;
	dirLight.shadow.camera.top = shadowExtent;
	dirLight.shadow.camera.bottom = - shadowExtent;
	dirLight.shadow.camera.updateProjectionMatrix();

	scene.fog.near = 34;
	scene.fog.far = 60;

	buildTrack( scene, models, cells );

	const probeHeight = 6;
	const probes = new LightProbeGrid(
		hw * 2, probeHeight, hd * 2,
		Math.max( 4, Math.round( hw / 4 ) ), 2, Math.max( 4, Math.round( hd / 4 ) ),
	);
	probes.position.set( bounds.centerX, probeHeight / 2, bounds.centerZ );
	probes.bake( renderer, scene, { cubemapSize: 32, near: 0.1, far: groundSize } );
	scene.add( probes );

	// Physics

	const worldSettings = createWorldSettings();
	worldSettings.gravity = [ 0, - 9.81, 0 ];

	const BPL_MOVING = addBroadphaseLayer( worldSettings );
	const BPL_STATIC = addBroadphaseLayer( worldSettings );
	const OL_MOVING = addObjectLayer( worldSettings, BPL_MOVING );
	const OL_STATIC = addObjectLayer( worldSettings, BPL_STATIC );

	enableCollision( worldSettings, OL_MOVING, OL_STATIC );
	enableCollision( worldSettings, OL_MOVING, OL_MOVING );

	const world = createWorld( worldSettings );
	world._OL_MOVING = OL_MOVING;
	world._OL_STATIC = OL_STATIC;

	buildWallColliders( world, null, cells );

	const roadHalf = groundSize / 2;
	rigidBody.create( world, {
		shape: box.create( { halfExtents: [ roadHalf, 0.01, roadHalf ] } ),
		motionType: MotionType.STATIC,
		objectLayer: OL_STATIC,
		position: [ bounds.centerX, - 0.125, bounds.centerZ ],
		friction: 5.0,
		restitution: 0.0,
		userData: 'ground',
	} );

	// Starting grid: three abreast, staggered, behind the finish line

	const finish = path.points[ 0 ];
	const fwd = path.tangents[ 0 ];
	const right = path.rights[ 0 ];
	const startYaw = path.yawAt( 0 );

	function gridSlot( k ) {

		const row = Math.floor( k / 3 );
		const col = k % 3;
		const back = 2.4 + row * 2.6 + ( col === 1 ? 1.0 : 0 );
		const side = ( col - 1 ) * 2.0;
		return [ finish.x - fwd.x * back + right.x * side, 0.5, finish.z - fwd.z * back + right.z * side ];

	}

	// Racers: AI cars fill the front of the grid, the player starts near the back

	const racers = [];
	const roster = [ ...OPPONENTS.slice( 0, 9 ), PLAYER, OPPONENTS[ 9 ] ];

	roster.forEach( ( def, k ) => {

		const isPlayer = def === PLAYER;
		const slot = gridSlot( k );
		const racer = {
			name: def.name, color: def.color, isPlayer, slot: k,
			wpIndex: 0, crossings: 0, progress: 0, rank: k,
			lapStart: 0, bestLap: null, finished: false, finishTime: null,
			item: null, rolling: 0, pendingItem: null, incoming: 0,
			raceActive: false, lastProgress: 0, progressCheck: 0, wrongWay: 0,
		};

		const body = createSphereBody( world, slot, { racer } );
		const vehicle = new Vehicle();
		vehicle.rigidBody = body;
		vehicle.physicsWorld = world;
		vehicle.spherePos.set( ...slot );
		vehicle.prevModelPos.set( slot[ 0 ], 0, slot[ 2 ] );
		vehicle.container.rotation.y = startYaw;
		vehicle.onFall = () => respawn( racer );
		vehicle.quietFx = ! isPlayer;

		const group = vehicle.init( models[ def.model ], def.tint );
		group.add( makeLabel( def.name, def.color, isPlayer ) );
		scene.add( group );

		racer.vehicle = vehicle;
		racer.body = body;

		if ( ! isPlayer ) {

			// Spread of driving skill; later grid slots are a touch quicker
			const skill = 0.86 + Math.random() * 0.06 + ( k / roster.length ) * 0.06;
			racer.ai = new AIDriver( racer, path, { skill, aggression: Math.random() } );

		} else {

			// Autopilot after the player crosses the finish
			racer.ai = new AIDriver( racer, path, { skill: 0.95, aggression: 0.5 } );

		}

		racers.push( racer );

	} );

	const player = racers.find( ( r ) => r.isPlayer );
	dirLight.target = player.vehicle.container;

	const vehicles = racers.map( ( r ) => r.vehicle );

	// Systems

	const cam = new Camera();
	const controls = new Controls();
	const smoke = new SmokeTrails( scene );
	const driftMarks = new DriftMarks( scene );
	const effects = new Effects( scene );

	const audio = new GameAudio();
	audio.init( cam.camera, player.vehicle.container );
	const sfx = new Sfx( audio.listener.context );

	const hud = new HUD( path, cam.camRightXZ, cam.camForwardXZ );
	hud.onTick = () => sfx.tick();

	const near = ( pos ) => Math.max( 0, 1 - pos.distanceTo( player.vehicle.spherePos ) / 30 );

	const items = new Items( scene, path, effects, {

		sound( name, pos ) {

			const vol = near( pos );
			if ( vol < 0.05 ) return;
			if ( name === 'explosion' ) sfx.explosion( vol );
			else if ( vol > 0.3 ) sfx[ name ]?.();

		},

		shake( pos, amount ) {

			cam.shake( amount * near( pos ) );

		},

		notify( racer, text ) {

			if ( racer.isPlayer ) hud.toast( text );

		},

	} );

	// ─── Race state ───────────────────────────────────────

	const race = { state: 'menu', time: 0, countdown: 0, laps: LAPS, resultsShown: false, postFinish: 0 };

	function placeOnGrid( racer ) {

		const [ x, y, z ] = gridSlot( racer.slot );
		racer.vehicle.teleport( x, y, z, startYaw );
		racer.wpIndex = path.nearestGlobal( racer.vehicle.spherePos ).index;
		racer.crossings = 0;
		racer.progress = racer.wpIndex + path.fraction( racer.vehicle.spherePos, racer.wpIndex );
		racer.lastProgress = racer.progress;
		racer.progressCheck = 0;
		racer.finished = false;
		racer.finishTime = null;
		racer.bestLap = null;
		racer.lapStart = 0;
		racer.raceActive = false;
		racer.incoming = 0;
		racer.wrongWay = 0;
		racer.vehicle.turbo = 100;
		racer.vehicle.shieldTimer = 0;
		racer.vehicle.frozen = true;
		racer.ai.reset();

	}

	function respawn( racer ) {

		// Back onto the centerline a little behind where the car was
		const idx = ( racer.wpIndex - 2 + path.count ) % path.count;
		const p = path.points[ idx ];
		racer.vehicle.teleport( p.x, 0.6, p.z, path.yawAt( idx ) );
		racer.vehicle.shieldTimer = Math.max( racer.vehicle.shieldTimer, 1.5 );
		racer.wpIndex = idx;
		racer.progressCheck = 0;
		effects.burst( racer.vehicle.spherePos, 20, { color: 0xffffff, speed: 3, size: 0.4, life: 0.5, gravity: 0, up: 1 } );

	}

	function startRace() {

		for ( const r of racers ) placeOnGrid( r );
		items.reset( racers );
		hud.hideResults();
		race.state = 'countdown';
		race.countdown = COUNTDOWN + 0.6;
		race.time = 0;
		race.resultsShown = false;
		race.postFinish = 0;
		race.lastCount = null;
		race.lastCrashToast = - 9;

	}

	function updateRanks() {

		const sorted = [ ...racers ].sort( ( a, b ) => {

			if ( a.finished && b.finished ) return a.finishTime - b.finishTime;
			if ( a.finished ) return - 1;
			if ( b.finished ) return 1;
			return b.progress - a.progress;

		} );

		sorted.forEach( ( r, i ) => r.rank = i );

	}

	const rankOf = ( r ) => r.rank / ( racers.length - 1 );

	function updateProgress( dt, racer ) {

		const v = racer.vehicle;
		const n = path.count;
		const prev = racer.wpIndex;
		const { index, dist } = path.nearest( v.spherePos, prev, 4, 8 );

		if ( prev > n * 0.75 && index < n * 0.25 ) onCrossLine( racer );
		else if ( prev < n * 0.25 && index > n * 0.75 ) racer.crossings --;

		racer.wpIndex = index;
		const before = racer.progress;
		racer.progress = racer.crossings * n + index + path.fraction( v.spherePos, index );

		// Way off the circuit (launched over a wall) – put it back
		if ( dist > path.halfWidth + 4 ) respawn( racer );

		if ( racer.isPlayer && race.state === 'racing' && ! racer.finished ) {

			const speed = Math.hypot( v.sphereVel.x, v.sphereVel.z );
			racer.wrongWay = ( racer.progress < before && speed > 2 ) ? racer.wrongWay + dt : Math.max( 0, racer.wrongWay - dt * 2 );
			if ( racer.wrongWay > 1 && hud.msgTimer <= 0 ) hud.message( '역주행!', { cls: 'small', duration: 0.8 } );

		}

		// AI cars that make no headway for a while get put back on track
		if ( ! racer.isPlayer && racer.raceActive && ! racer.finished ) {

			racer.progressCheck += dt;

			if ( racer.progressCheck > 6 ) {

				if ( racer.progress - racer.lastProgress < 3 ) respawn( racer );
				racer.lastProgress = racer.progress;
				racer.progressCheck = 0;

			}

		}

	}

	function onCrossLine( racer ) {

		racer.crossings ++;
		if ( race.state !== 'racing' || racer.finished ) return;

		const lapsDone = racer.crossings - 1;
		const lapTime = race.time - racer.lapStart;

		if ( lapsDone >= 1 && ( racer.bestLap === null || lapTime < racer.bestLap ) ) racer.bestLap = lapTime;

		racer.lapStart = race.time;

		if ( lapsDone >= LAPS ) {

			racer.finished = true;
			racer.finishTime = race.time;
			updateRanks();

			if ( racer.isPlayer ) {

				sfx.finish();
				hud.message( 'FINISH!', { cls: 'go', duration: 2.5 } );
				race.postFinish = 0;

			}

			return;

		}

		if ( racer.isPlayer && lapsDone >= 1 ) {

			sfx.lap();
			hud.message( lapsDone === LAPS - 1 ? 'FINAL LAP!' : `LAP ${ lapsDone + 1 }`, { cls: 'small', duration: 1.5 } );
			hud.toast( `랩 타임 ${ formatTime( lapTime ) }` );

		}

	}

	// ─── Collisions ──────────────────────────────────────

	const contacts = [];

	const contactListener = {

		onContactAdded( bodyA, bodyB, manifold, settings ) {

			const ra = bodyA.userData?.racer;
			const rb = bodyB.userData?.racer;
			const n = manifold.worldSpaceNormal;

			if ( ra && rb ) {

				// Bouncy bumper-car response between karts
				settings.combinedRestitution = 0.55;
				settings.combinedFriction = 0.2;
				contacts.push( { a: ra, b: rb, nx: n[ 0 ], nz: n[ 2 ] } );

			} else if ( ra || rb ) {

				const other = ra ? bodyB : bodyA;
				if ( other.userData === 'ground' ) return;
				// Normal pointing from the car into the wall
				const s = ra ? 1 : - 1;
				contacts.push( { a: ra || rb, b: null, nx: n[ 0 ] * s, nz: n[ 2 ] * s } );

			}

		},

	};

	const _n = new THREE.Vector3();
	const _p = new THREE.Vector3();
	const _rel = new THREE.Vector3();

	function processContacts( preVel ) {

		for ( const c of contacts ) {

			_n.set( c.nx, 0, c.nz ).normalize();
			const va = preVel.get( c.a );

			if ( ! c.b ) {

				// Car vs wall
				const into = va.dot( _n );
				if ( into < 2.5 ) continue;
				_p.copy( c.a.vehicle.spherePos ).addScaledVector( _n, 0.5 );
				_p.y = 0.3;
				effects.sparks( _p, _n, into );
				c.a.vehicle.flash = Math.min( 1, into / 12 );

				if ( c.a.isPlayer ) {

					audio.playImpact( into );
					cam.shake( Math.min( 0.5, into * 0.03 ) );

				}

				continue;

			}

			const vb = preVel.get( c.b );
			const closing = _rel.subVectors( va, vb ).dot( _n );
			if ( closing < 1 ) continue;

			const A = c.a.vehicle;
			const B = c.b.vehicle;
			_p.addVectors( A.spherePos, B.spherePos ).multiplyScalar( 0.5 );
			_p.y = 0.4;

			effects.sparks( _p, _n, closing * 1.5 );
			if ( closing > 5 ) effects.burst( _p, 8, { color: 0xffffff, speed: 4, size: 0.6, life: 0.3, gravity: 0, up: 1 } );

			// Knockback: shields turn you into a battering ram
			let ka = Math.min( closing * 0.45, 5 );
			let kb = ka;

			if ( A.shieldTimer > 0 && B.shieldTimer <= 0 ) {

				ka = 0;
				kb = kb * 2 + 3;
				B.spinOut( 0.8 );

			} else if ( B.shieldTimer > 0 && A.shieldTimer <= 0 ) {

				kb = 0;
				ka = ka * 2 + 3;
				A.spinOut( 0.8 );

			}

			const hop = closing > 6 ? 1.5 : 0;
			rigidBody.addLinearVelocity( world, c.a.body, [ - _n.x * ka, hop, - _n.z * ka ] );
			rigidBody.addLinearVelocity( world, c.b.body, [ _n.x * kb, hop, _n.z * kb ] );

			// Side swipes twist the cars
			if ( closing > 4 ) {

				A.angularSpeed += ( Math.random() - 0.5 ) * closing * 0.5;
				B.angularSpeed += ( Math.random() - 0.5 ) * closing * 0.5;

			}

			A.flash = Math.max( A.flash, Math.min( 1, closing / 8 ) );
			B.flash = Math.max( B.flash, Math.min( 1, closing / 8 ) );

			if ( c.a.isPlayer || c.b.isPlayer ) {

				audio.playImpact( closing * 1.5 );
				cam.shake( Math.min( 0.9, closing * 0.07 ) );
				if ( closing > 5 && race.time - ( race.lastCrashToast ?? - 9 ) > 2 ) {

					race.lastCrashToast = race.time;
					hud.toast( `💥 ${ c.a.isPlayer ? c.b.name : c.a.name } 와(과) 충돌!` );

				}

			} else if ( closing > 3 ) {

				const vol = near( _p );
				if ( vol > 0.1 ) sfx.crash( vol * Math.min( 1, closing / 8 ) );

			}

		}

		contacts.length = 0;

	}

	// ─── Per-frame effects ───────────────────────────────

	const _rear = new THREE.Vector3();
	const _back = new THREE.Vector3();

	function emitBoostFlames( racer ) {

		const v = racer.vehicle;
		if ( ! v.boosting ) return;

		_back.set( 0, 0, - 1 ).applyQuaternion( v.container.quaternion );
		const strong = v.boostTimer > 0;

		for ( const side of [ - 0.16, 0.16 ] ) {

			_rear.set( side, 0.3, - 0.5 );
			v.container.localToWorld( _rear );
			effects.emit(
				_rear.x, _rear.y, _rear.z,
				_back.x * 4 + ( Math.random() - 0.5 ), 0.6 + Math.random() * 0.6, _back.z * 4 + ( Math.random() - 0.5 ),
				strong ? ( Math.random() < 0.5 ? 0x4fc3ff : 0xb07bff ) : ( Math.random() < 0.5 ? 0xff7a1a : 0xffd04a ),
				strong ? 0.6 : 0.45, 0.3, 0
			);

		}

	}

	// ─── Main loop ───────────────────────────────────────

	const stats = { used: 0, frames: 0 };
	const preVel = new Map();
	for ( const r of racers ) preVel.set( r, new THREE.Vector3() );

	const idleInput = { x: 0, z: 0, turbo: false, item: false, touchActive: false };
	const _camLead = new THREE.Vector3();
	const timer = new THREE.Timer();

	for ( const r of racers ) placeOnGrid( r );
	updateRanks();

	function animate() {

		requestAnimationFrame( animate );

		timer.update();
		stats.frames ++;
		const dt = Math.min( timer.getDelta(), 1 / 30 );

		const input = controls.update();

		// Race flow
		if ( race.state === 'countdown' ) {

			race.countdown -= dt;
			const count = Math.ceil( race.countdown - 0.6 );

			if ( count !== race.lastCount && count >= 1 && count <= COUNTDOWN ) {

				hud.message( String( count ), { duration: 0.9 } );
				sfx.countdown( false );

			}

			race.lastCount = count;

			if ( race.countdown <= 0.6 ) {

				race.state = 'racing';
				hud.message( 'GO!', { cls: 'go', duration: 1 } );
				sfx.countdown( true );

				for ( const r of racers ) {

					r.vehicle.frozen = false;
					r.raceActive = true;

				}

			}

		} else if ( race.state === 'racing' ) {

			race.time += dt;

			if ( player.finished ) {

				race.postFinish += dt;
				const allDone = racers.every( ( r ) => r.finished );

				if ( race.postFinish > 2 ) {

					// Keep the results table live until everyone is home (or 30s pass)
					const final = allDone || race.postFinish > 32;
					const tick = Math.floor( race.postFinish * 2 ) !== Math.floor( ( race.postFinish - dt ) * 2 );
					if ( final || ! race.resultsShown || tick ) hud.showResults( racers, player, final );
					race.resultsShown = true;
					if ( final ) race.state = 'finished';

				}

			}

		}

		// Drive
		for ( const r of racers ) {

			let inp;

			if ( r.isPlayer && ! r.finished && ! DEMO ) {

				inp = race.state === 'menu' ? idleInput : input;
				if ( input.reset && race.state === 'racing' ) respawn( r );

			} else {

				inp = r.ai.update( dt, racers, items );

				// Rubber band: keep the pack close to the player
				const gap = r.progress - player.progress;
				const band = r.isPlayer ? 1 : THREE.MathUtils.clamp( 1 - gap * 0.004, 0.9, 1.08 );
				r.vehicle.maxSpeed = MAX_SPEED * r.ai.skill * band;

			}

			if ( inp.item && race.state === 'racing' && items.use( r, racers ) ) stats.used ++;
			r.input = inp;
			preVel.get( r ).copy( r.vehicle.sphereVel );

		}

		updateWorld( world, contactListener, dt );

		for ( const r of racers ) r.vehicle.update( dt, r.input );

		processContacts( preVel );

		for ( const r of racers ) updateProgress( dt, r );
		updateRanks();

		if ( race.state === 'racing' ) items.update( dt, racers, rankOf );
		else items.updateShields( racers );

		for ( const r of racers ) emitBoostFlames( r );

		effects.update( dt );
		smoke.update( dt, vehicles );
		driftMarks.update( dt, vehicles );

		// Camera & audio follow the player
		const pv = player.vehicle;
		dirLight.position.set( pv.spherePos.x + 11.4, 15, pv.spherePos.z - 5.3 );

		const mv = pv.modelVelocity;
		_camLead.set( 0, 0, 1 ).applyQuaternion( pv.container.quaternion ).multiplyScalar( Math.sqrt( mv.x * mv.x + mv.z * mv.z ) );
		cam.fovKick = pv.boosting ? ( pv.boostTimer > 0 ? 1.3 : 1 ) : 0;
		cam.update( dt, pv.spherePos, _camLead );

		audio.update( dt, pv.linearSpeed / MAX_SPEED, player.input.z, pv.driftIntensity );

		if ( race.state !== 'menu' ) hud.update( dt, player, racers, items, race );

		renderer.render( scene, cam.camera );

	}

	animate();

	// ─── Menus ───────────────────────────────────────────

	const startBtn = document.getElementById( 'start-btn' );
	startBtn.disabled = false;
	startBtn.textContent = '레이스 시작';

	const begin = () => {

		if ( race.state !== 'menu' ) return;
		document.getElementById( 'start-screen' ).classList.add( 'hidden' );
		hud.show();
		startRace();

	};

	startBtn.addEventListener( 'click', begin );
	window.addEventListener( 'keydown', ( e ) => {

		if ( e.code === 'Enter' ) {

			if ( race.state === 'menu' ) begin();
			else if ( race.resultsShown ) startRace();

		}

	} );

	document.getElementById( 'restart-btn' ).addEventListener( 'click', startRace );
	document.getElementById( 'course-btn' ).addEventListener( 'click', () => location.href = courseUrl( COURSE.id ) );

	window.game = { racers, player, items, race }; // handy from the devtools console

	if ( DEMO ) {

		begin();
		setInterval( () => console.log( 'DEMO fps', stats.frames / 3, 'items used', stats.used, 'held', racers.map( ( r ) => r.item || '-' ).join( ',' ), race.state, race.time.toFixed( 1 ), racers.map( ( r ) =>
			`${ r.name }:${ r.crossings }/${ r.progress.toFixed( 0 ) }${ r.finished ? '#' + r.finishTime.toFixed( 1 ) : '' }` ).join( ' ' ), ( stats.frames = 0 ) ), 3000 );

	}

}

init();
