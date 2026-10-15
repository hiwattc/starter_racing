import * as THREE from 'three';
import { rigidBody } from 'crashcat';

export const ITEM_INFO = {
	boost: { icon: '🔥', name: '부스터' },
	shield: { icon: '🛡️', name: '실드' },
	missile: { icon: '🚀', name: '미사일' },
	oil: { icon: '🛢️', name: '오일' },
	turbo: { icon: '⚡', name: '터보 충전' },
};

export const ITEM_KEYS = Object.keys( ITEM_INFO );

// Weights for the leader (rank 0) and the last car (rank 1); blended by position
const WEIGHTS_FRONT = { boost: 5, shield: 30, missile: 10, oil: 35, turbo: 20 };
const WEIGHTS_BACK = { boost: 35, shield: 10, missile: 35, oil: 5, turbo: 15 };

const BOX_RESPAWN = 2;
const MISSILE_SPEED = 22;
const MISSILE_LIFE = 6;
const OIL_LIFE = 25;

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _zAxis = new THREE.Vector3( 0, 0, 1 );

function rollItem( rank01 ) {

	let total = 0;
	const weights = {};

	for ( const k of ITEM_KEYS ) {

		weights[ k ] = THREE.MathUtils.lerp( WEIGHTS_FRONT[ k ], WEIGHTS_BACK[ k ], rank01 );
		total += weights[ k ];

	}

	let r = Math.random() * total;

	for ( const k of ITEM_KEYS ) {

		r -= weights[ k ];
		if ( r <= 0 ) return k;

	}

	return 'boost';

}

function makeBoxTexture() {

	const size = 128;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext( '2d' );
	const g = ctx.createLinearGradient( 0, 0, size, size );
	g.addColorStop( 0, '#ff4fd8' );
	g.addColorStop( 0.5, '#4fc3ff' );
	g.addColorStop( 1, '#ffe14f' );
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, size, size );
	ctx.strokeStyle = 'rgba(255,255,255,0.9)';
	ctx.lineWidth = 10;
	ctx.strokeRect( 5, 5, size - 10, size - 10 );
	ctx.fillStyle = '#fff';
	ctx.font = 'bold 92px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.shadowColor = 'rgba(0,0,0,0.4)';
	ctx.shadowBlur = 6;
	ctx.fillText( '?', size / 2, size / 2 + 6 );
	const tex = new THREE.CanvasTexture( canvas );
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;

}

export class Items {

	constructor( scene, path, effects, hooks ) {

		this.scene = scene;
		this.path = path;
		this.effects = effects;
		this.hooks = hooks; // { sound( name, pos ), shake( pos, amount ), notify( racer, text ) }

		this.boxes = [];
		this.missiles = [];
		this.oils = [];
		this.time = 0;

		const boxTex = makeBoxTexture();
		this.boxGeo = new THREE.BoxGeometry( 0.8, 0.8, 0.8 );
		this.boxMat = new THREE.MeshStandardMaterial( {
			map: boxTex,
			emissive: 0xffffff,
			emissiveMap: boxTex,
			emissiveIntensity: 0.45,
			transparent: true,
			opacity: 0.88,
			roughness: 0.3,
		} );

		this.oilGeo = new THREE.CircleGeometry( 1, 20 ).rotateX( - Math.PI / 2 );
		this.oilMat = new THREE.MeshStandardMaterial( { color: 0x15121f, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: - 6 } );

		this.shieldGeo = new THREE.SphereGeometry( 1.0, 24, 16 );

		this.placeBoxes();

	}

	placeBoxes() {

		const path = this.path;
		const rows = [ 0.12, 0.32, 0.52, 0.7, 0.88 ];
		const lanes = [ - 2.2, - 1.1, 0, 1.1, 2.2 ];

		for ( const f of rows ) {

			// Snap to a fairly straight spot
			let idx = Math.floor( f * path.count );
			for ( let k = 0; k < 10 && path.curvature[ idx ] > 0.15; k ++ ) idx = ( idx + 1 ) % path.count;

			const p = path.points[ idx ];
			const r = path.rights[ idx ];

			for ( const lane of lanes ) {

				const mesh = new THREE.Mesh( this.boxGeo, this.boxMat );
				mesh.castShadow = true;
				mesh.position.set( p.x + r.x * lane, 0.55, p.z + r.z * lane );
				mesh.rotation.set( Math.random(), Math.random() * 6, 0.6 );
				this.scene.add( mesh );
				this.boxes.push( { mesh, base: mesh.position.clone(), timer: 0, phase: Math.random() * 6 } );

			}

		}

	}

	reset( racers ) {

		for ( const b of this.boxes ) {

			b.timer = 0;
			b.mesh.visible = true;
			b.mesh.scale.setScalar( 1 );

		}

		for ( const m of this.missiles ) this.scene.remove( m.mesh );
		for ( const o of this.oils ) this.scene.remove( o.mesh );
		this.missiles.length = 0;
		this.oils.length = 0;

		for ( const r of racers ) {

			r.item = null;
			r.rolling = 0;
			r.pendingItem = null;

		}

	}

	// Fire the racer's held item
	use( racer, racers ) {

		const item = racer.item;
		if ( ! item || racer.rolling > 0 ) return false;

		const v = racer.vehicle;
		racer.item = null;

		switch ( item ) {

			case 'boost':
				v.boostTimer = 1.6;
				this.hooks.sound( 'boost', v.spherePos );
				break;

			case 'turbo':
				v.turbo = 100;
				v.boostTimer = Math.max( v.boostTimer, 0.5 );
				this.hooks.sound( 'boost', v.spherePos );
				break;

			case 'shield':
				v.shieldTimer = 6;
				this.hooks.sound( 'shield', v.spherePos );
				break;

			case 'missile':
				this.fireMissile( racer, racers );
				break;

			case 'oil':
				this.dropOil( racer );
				break;

		}

		return true;

	}

	fireMissile( racer, racers ) {

		const v = racer.vehicle;
		_dir.set( 0, 0, 1 ).applyQuaternion( v.container.quaternion ).setY( 0 ).normalize();

		// Lock on to the car directly ahead in race order
		let target = null;

		for ( const other of racers ) {

			if ( other === racer || other.finished ) continue;
			if ( other.progress <= racer.progress ) continue;
			if ( ! target || other.progress < target.progress ) target = other;

		}

		const mesh = new THREE.Group();
		const body = new THREE.Mesh( new THREE.CylinderGeometry( 0.12, 0.12, 0.7, 10 ).rotateX( Math.PI / 2 ), new THREE.MeshStandardMaterial( { color: 0xd8302a, emissive: 0x501010 } ) );
		const nose = new THREE.Mesh( new THREE.ConeGeometry( 0.12, 0.3, 10 ).rotateX( Math.PI / 2 ).translate( 0, 0, 0.5 ), new THREE.MeshStandardMaterial( { color: 0xffffff } ) );
		const fin = new THREE.Mesh( new THREE.BoxGeometry( 0.45, 0.04, 0.15 ).translate( 0, 0, - 0.3 ), new THREE.MeshStandardMaterial( { color: 0x333333 } ) );
		mesh.add( body, nose, fin );
		mesh.position.copy( v.spherePos ).addScaledVector( _dir, 1.2 );
		mesh.position.y = 0.6;
		mesh.traverse( ( c ) => c.castShadow = true );
		this.scene.add( mesh );

		this.missiles.push( {
			mesh,
			owner: racer,
			target,
			velocity: _dir.clone().multiplyScalar( MISSILE_SPEED ),
			idx: racer.wpIndex,
			life: MISSILE_LIFE,
		} );

		if ( target ) target.incoming = ( target.incoming || 0 ) + 1;
		this.hooks.sound( 'launch', v.spherePos );

	}

	dropOil( racer ) {

		const v = racer.vehicle;
		_dir.set( 0, 0, 1 ).applyQuaternion( v.container.quaternion ).setY( 0 ).normalize();

		const mesh = new THREE.Mesh( this.oilGeo, this.oilMat );
		mesh.position.copy( v.spherePos ).addScaledVector( _dir, - 1.6 );
		mesh.position.y = - 0.1;
		mesh.receiveShadow = true;
		mesh.scale.setScalar( 0.2 );
		this.scene.add( mesh );

		this.oils.push( { mesh, owner: racer, life: OIL_LIFE, grace: 1.0 } );
		this.hooks.sound( 'splat', v.spherePos );

	}

	update( dt, racers, rankOf ) {

		this.time += dt;
		this.updateBoxes( dt, racers, rankOf );
		this.updateMissiles( dt, racers );
		this.updateOils( dt, racers );
		this.updateShields( racers );

		// Roulette
		for ( const r of racers ) {

			if ( r.rolling > 0 ) {

				r.rolling -= dt;

				if ( r.rolling <= 0 ) {

					r.item = r.pendingItem;
					r.pendingItem = null;
					if ( r.isPlayer ) this.hooks.sound( 'itemReady', r.vehicle.spherePos );

				}

			}

		}

	}

	updateBoxes( dt, racers, rankOf ) {

		for ( const b of this.boxes ) {

			const m = b.mesh;

			if ( b.timer > 0 ) {

				b.timer -= dt;

				if ( b.timer <= 0 ) {

					m.visible = true;
					m.scale.setScalar( 0.01 );

				}

				continue;

			}

			m.rotation.y += dt * 1.8;
			m.rotation.x += dt * 0.7;
			m.position.y = b.base.y + Math.sin( this.time * 3 + b.phase ) * 0.12;
			if ( m.scale.x < 1 ) m.scale.setScalar( Math.min( 1, m.scale.x + dt * 3 ) );

			for ( const r of racers ) {

				const p = r.vehicle.spherePos;
				if ( ( p.x - m.position.x ) ** 2 + ( p.z - m.position.z ) ** 2 > 1.1 ) continue;

				b.timer = BOX_RESPAWN;
				m.visible = false;
				this.effects.burst( m.position, 30, { color: [ 0xff4fd8, 0x4fc3ff, 0xffe14f, 0xffffff ], speed: 5, size: 0.35, life: 0.6, gravity: - 6, up: 3 } );

				if ( ! r.item && r.rolling <= 0 ) {

					r.pendingItem = rollItem( rankOf( r ) );
					r.rolling = r.isPlayer ? 1.4 : 0.8;
					if ( r.isPlayer ) this.hooks.sound( 'pickup', p );

				}

				break;

			}

		}

	}

	updateMissiles( dt, racers ) {

		const path = this.path;

		for ( let i = this.missiles.length - 1; i >= 0; i -- ) {

			const m = this.missiles[ i ];
			m.life -= dt;
			const pos = m.mesh.position;

			// Follow the track, then home in once the target is close
			let aim;

			if ( m.target && ! m.target.finished && m.target.vehicle.spherePos.distanceTo( pos ) < 9 ) {

				aim = _v.copy( m.target.vehicle.spherePos );

			} else {

				const near = path.nearest( pos, m.idx, 2, 6 );
				m.idx = near.index;
				aim = _v.copy( path.points[ path.walk( m.idx, 4 ) ] );

			}

			_dir.subVectors( aim, pos ).setY( 0 ).normalize();
			const cur = m.velocity.clone().normalize();
			const turn = Math.min( 1, dt * 6 );
			cur.lerp( _dir, turn ).normalize();
			m.velocity.copy( cur ).multiplyScalar( MISSILE_SPEED );

			pos.addScaledVector( m.velocity, dt );
			pos.y = 0.6 + Math.sin( m.life * 20 ) * 0.03;
			m.mesh.quaternion.setFromUnitVectors( _zAxis, cur );

			// Exhaust
			this.effects.emit( pos.x - cur.x * 0.5, pos.y, pos.z - cur.z * 0.5,
				( Math.random() - 0.5 ), 0.5, ( Math.random() - 0.5 ),
				Math.random() < 0.5 ? 0xff9a2a : 0xffe08a, 0.45, 0.35, 0 );

			let hit = null;

			for ( const r of racers ) {

				if ( r === m.owner && m.life > MISSILE_LIFE - 0.5 ) continue;
				const p = r.vehicle.spherePos;
				if ( ( p.x - pos.x ) ** 2 + ( p.z - pos.z ) ** 2 < 1.0 ) {

					hit = r;
					break;

				}

			}

			if ( hit || m.life <= 0 ) {

				this.explode( m, hit );
				this.missiles.splice( i, 1 );

			}

		}

	}

	explode( m, hit ) {

		const pos = m.mesh.position;
		this.scene.remove( m.mesh );
		if ( m.target ) m.target.incoming = Math.max( 0, ( m.target.incoming || 1 ) - 1 );

		this.effects.explosion( pos );
		this.hooks.sound( 'explosion', pos );
		this.hooks.shake( pos, 0.8 );

		if ( ! hit ) return;

		const v = hit.vehicle;

		if ( v.shieldTimer > 0 ) {

			v.shieldTimer = 0;
			this.hooks.notify( hit, '실드가 미사일을 막았다!' );
			this.hooks.notify( m.owner, `${ hit.name } 실드에 막힘` );
			return;

		}

		v.spinOut( 1.8 );
		rigidBody.addLinearVelocity( v.physicsWorld, v.rigidBody, [ m.velocity.x * 0.15, 7, m.velocity.z * 0.15 ] );
		this.hooks.notify( hit, `💥 ${ m.owner.name }의 미사일에 맞았다!` );
		this.hooks.notify( m.owner, `💥 ${ hit.name } 명중!` );

	}

	updateOils( dt, racers ) {

		for ( let i = this.oils.length - 1; i >= 0; i -- ) {

			const o = this.oils[ i ];
			o.life -= dt;
			o.grace -= dt;
			const s = o.mesh.scale.x;
			if ( s < 1 ) o.mesh.scale.setScalar( Math.min( 1, s + dt * 4 ) );

			let consumed = o.life <= 0;

			if ( ! consumed ) {

				for ( const r of racers ) {

					if ( r === o.owner && o.grace > 0 ) continue;
					const p = r.vehicle.spherePos;
					if ( ( p.x - o.mesh.position.x ) ** 2 + ( p.z - o.mesh.position.z ) ** 2 > 1.0 ) continue;

					if ( r.vehicle.spinOut( 1.3 ) ) {

						this.hooks.sound( 'spin', p );
						this.hooks.notify( r, '🛢️ 오일에 미끄러졌다!' );
						if ( r !== o.owner ) this.hooks.notify( o.owner, `🛢️ ${ r.name } 미끄러짐!` );

					}

					this.effects.burst( o.mesh.position, 14, { color: 0x6a5acd, speed: 3, size: 0.3, life: 0.5, gravity: - 10, up: 3 } );
					consumed = true;
					break;

				}

			}

			if ( consumed ) {

				this.scene.remove( o.mesh );
				this.oils.splice( i, 1 );

			}

		}

	}

	updateShields( racers ) {

		for ( const r of racers ) {

			const v = r.vehicle;

			if ( v.shieldTimer > 0 && ! r.shieldMesh ) {

				r.shieldMesh = new THREE.Mesh( this.shieldGeo, new THREE.MeshBasicMaterial( {
					color: 0x66ddff, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending,
				} ) );
				r.shieldMesh.position.y = 0.45;
				v.container.add( r.shieldMesh );

			}

			if ( r.shieldMesh ) {

				const on = v.shieldTimer > 0;
				r.shieldMesh.visible = on;

				if ( on ) {

					// Blink before expiring
					const blink = v.shieldTimer < 1.5 && Math.sin( this.time * 30 ) > 0;
					r.shieldMesh.material.opacity = blink ? 0.08 : 0.22 + Math.sin( this.time * 8 ) * 0.06;
					r.shieldMesh.scale.setScalar( 1 + Math.sin( this.time * 6 ) * 0.04 );

				}

			}

		}

	}

	// AI helper: is the racer about to be hit by a missile?
	isTargeted( racer ) {

		return ( racer.incoming || 0 ) > 0;

	}

}

export { rollItem };
