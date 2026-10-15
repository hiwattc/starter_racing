import * as THREE from 'three';

const _forward = new THREE.Vector3();
const _to = new THREE.Vector3();

function wrapAngle( a ) {

	while ( a > Math.PI ) a -= Math.PI * 2;
	while ( a < - Math.PI ) a += Math.PI * 2;
	return a;

}

// Follows the track centerline with a personal lane offset, dodges cars,
// uses turbo on straights and fires items when they make sense.
export class AIDriver {

	constructor( racer, path, { skill = 0.92, aggression = 0.5 } = {} ) {

		this.racer = racer;
		this.path = path;
		this.skill = skill;
		this.aggression = aggression;

		this.lane = ( Math.random() - 0.5 ) * 2.4;
		this.laneTarget = this.lane;
		this.laneTimer = 2 + Math.random() * 3;

		this.stuckTime = 0;
		this.reverseTime = 0;
		this.reverseSteer = 0;
		this.itemDelay = 0;
		this.turboHold = false;

		this.input = { x: 0, z: 0, turbo: false, item: false, touchActive: false };

	}

	reset() {

		this.stuckTime = 0;
		this.reverseTime = 0;
		this.itemDelay = 0;
		this.turboHold = false;

	}

	update( dt, racers, items ) {

		const racer = this.racer;
		const v = racer.vehicle;
		const path = this.path;
		const input = this.input;
		input.item = false;
		input.turbo = false;

		const speed = Math.hypot( v.sphereVel.x, v.sphereVel.z );
		_forward.set( 0, 0, 1 ).applyQuaternion( v.container.quaternion ).setY( 0 ).normalize();

		// Lane wandering
		this.laneTimer -= dt;

		if ( this.laneTimer <= 0 ) {

			this.laneTimer = 2 + Math.random() * 4;
			this.laneTarget = ( Math.random() - 0.5 ) * 3.2;

		}

		// Dodge whoever is right in front
		for ( const other of racers ) {

			if ( other === racer ) continue;
			_to.subVectors( other.vehicle.spherePos, v.spherePos ).setY( 0 );
			const ahead = _to.dot( _forward );
			if ( ahead < 0 || ahead > 5 ) continue;
			const lateral = _to.x * - _forward.z + _to.z * _forward.x; // + = left side of the car
			if ( Math.abs( lateral ) > 1.3 ) continue;
			const right = path.rights[ racer.wpIndex ];
			const sideSign = Math.sign( _to.dot( right ) ) || 1;
			this.laneTarget = THREE.MathUtils.clamp( this.lane - sideSign * 1.8, - 2.2, 2.2 );
			this.laneTimer = 1.5;
			break;

		}

		// Missiles in flight: try to sidestep oil on the racing line
		for ( const oil of items.oils ) {

			_to.subVectors( oil.mesh.position, v.spherePos ).setY( 0 );
			const ahead = _to.dot( _forward );
			if ( ahead < 0 || ahead > 8 ) continue;
			const lateral = _to.dot( path.rights[ racer.wpIndex ] );
			if ( Math.abs( lateral - this.lane ) < 1.4 ) this.laneTarget = THREE.MathUtils.clamp( lateral + ( lateral > 0 ? - 2 : 2 ), - 2.2, 2.2 );

		}

		this.lane = THREE.MathUtils.lerp( this.lane, this.laneTarget, 1 - Math.exp( - dt * 1.5 ) );

		// Steering target ahead on the line
		const lookahead = 2.5 + speed * 0.32;
		const ti = path.walk( racer.wpIndex, lookahead );
		const target = path.points[ ti ];
		const right = path.rights[ ti ];
		_to.set( target.x + right.x * this.lane - v.spherePos.x, 0, target.z + right.z * this.lane - v.spherePos.z );

		const yaw = Math.atan2( _forward.x, _forward.z );
		const desired = Math.atan2( _to.x, _to.z );
		const diff = wrapAngle( desired - yaw );

		const steer = THREE.MathUtils.clamp( - diff * 2.4, - 1, 1 );
		input.x = THREE.MathUtils.lerp( input.x, steer, 1 - Math.exp( - dt * 12 ) );

		// Lift for sharp turns coming up
		let curve = 0;
		const ci = path.walk( racer.wpIndex, 2 + speed * 0.45 );
		curve = path.curvature[ ci ];
		let throttle = 1;
		if ( curve > 0.6 && speed > 8.5 ) throttle = 0.35;
		if ( Math.abs( diff ) > 1.2 ) throttle = 0.4;
		input.z = throttle;

		// Turbo on straights
		if ( this.turboHold ) {

			if ( v.turbo < 8 || curve > 0.35 || Math.abs( diff ) > 0.3 ) this.turboHold = false;

		} else if ( v.turbo > 45 + ( 1 - this.aggression ) * 40 && curve < 0.1 && Math.abs( diff ) < 0.12 && speed > 5 ) {

			this.turboHold = true;

		}

		input.turbo = this.turboHold;

		// Stuck against a wall or another car: back up with opposite lock
		if ( racer.raceActive && v.spinTimer <= 0 ) {

			if ( this.reverseTime > 0 ) {

				this.reverseTime -= dt;
				input.z = - 1;
				input.x = this.reverseSteer;
				input.turbo = false;

			} else if ( speed < 1.2 ) {

				this.stuckTime += dt;

				if ( this.stuckTime > 1.2 ) {

					this.reverseTime = 0.9;
					this.reverseSteer = diff > 0 ? 1 : - 1;
					this.stuckTime = - 0.5;

				}

			} else {

				this.stuckTime = Math.max( 0, this.stuckTime - dt );

			}

		}

		this.updateItems( dt, racers, items, diff, curve );

		return input;

	}

	updateItems( dt, racers, items, diff, curve ) {

		const racer = this.racer;
		const v = racer.vehicle;

		if ( ! racer.item ) {

			this.itemDelay = 0.6 + Math.random() * 2.5 * ( 1 - this.aggression );
			return;

		}

		this.itemDelay -= dt;
		if ( this.itemDelay > 0 ) return;

		// Don't sit on an item forever
		if ( this.itemDelay < - 6 ) {

			this.input.item = true;
			return;

		}

		let use = false;

		switch ( racer.item ) {

			case 'boost':
				use = curve < 0.15 && Math.abs( diff ) < 0.15;
				break;

			case 'turbo':
				use = v.turbo < 70;
				break;

			case 'shield':
				use = items.isTargeted( racer ) || Math.random() < dt * 0.3;
				break;

			case 'missile': {

				// Someone close ahead in the race?
				use = racers.some( ( o ) => o !== racer && ! o.finished && o.progress > racer.progress && o.progress - racer.progress < 25 );
				if ( ! use && racer.rank === 0 ) use = Math.random() < dt * 0.2;
				break;

			}

			case 'oil': {

				use = racers.some( ( o ) => o !== racer && o.progress < racer.progress && racer.progress - o.progress < 8 );
				if ( ! use ) use = Math.random() < dt * 0.15;
				break;

			}

		}

		if ( use ) this.input.item = true;

	}

}
