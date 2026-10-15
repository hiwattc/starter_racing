import * as THREE from 'three';

const POOL_SIZE = 3000;

function makeGlowTexture() {

	const size = 64;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext( '2d' );
	const g = ctx.createRadialGradient( size / 2, size / 2, 0, size / 2, size / 2, size / 2 );
	g.addColorStop( 0, 'rgba(255,255,255,1)' );
	g.addColorStop( 0.35, 'rgba(255,255,255,0.7)' );
	g.addColorStop( 1, 'rgba(255,255,255,0)' );
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, size, size );
	return new THREE.CanvasTexture( canvas );

}

const _color = new THREE.Color();

// Additive glowing particles: sparks, boost flames, explosions, pickups
export class Effects {

	constructor( scene ) {

		this.positions = new Float32Array( POOL_SIZE * 3 );
		this.colors = new Float32Array( POOL_SIZE * 3 );
		this.sizes = new Float32Array( POOL_SIZE );
		this.velocities = new Float32Array( POOL_SIZE * 3 );
		this.life = new Float32Array( POOL_SIZE );
		this.maxLife = new Float32Array( POOL_SIZE );
		this.baseSize = new Float32Array( POOL_SIZE );
		this.gravity = new Float32Array( POOL_SIZE );
		this.baseColors = new Float32Array( POOL_SIZE * 3 );

		const geometry = new THREE.BufferGeometry();
		this.posAttr = new THREE.BufferAttribute( this.positions, 3 ).setUsage( THREE.DynamicDrawUsage );
		this.colAttr = new THREE.BufferAttribute( this.colors, 3 ).setUsage( THREE.DynamicDrawUsage );
		this.sizeAttr = new THREE.BufferAttribute( this.sizes, 1 ).setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( 'position', this.posAttr );
		geometry.setAttribute( 'color', this.colAttr );
		geometry.setAttribute( 'aSize', this.sizeAttr );

		const material = new THREE.PointsMaterial( {
			map: makeGlowTexture(),
			size: 1,
			vertexColors: true,
			transparent: true,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
			sizeAttenuation: true,
		} );

		material.onBeforeCompile = ( shader ) => {

			shader.vertexShader = 'attribute float aSize;\n' + shader.vertexShader;
			shader.vertexShader = shader.vertexShader.replace( 'gl_PointSize = size;', 'gl_PointSize = size * aSize;' );

		};

		this.points = new THREE.Points( geometry, material );
		this.points.frustumCulled = false;
		this.points.renderOrder = 10;
		scene.add( this.points );

		this.index = 0;

	}

	emit( x, y, z, vx, vy, vz, color, size, life, gravity = 0 ) {

		const i = this.index;
		this.index = ( i + 1 ) % POOL_SIZE;

		const o = i * 3;
		this.positions[ o ] = x;
		this.positions[ o + 1 ] = y;
		this.positions[ o + 2 ] = z;
		this.velocities[ o ] = vx;
		this.velocities[ o + 1 ] = vy;
		this.velocities[ o + 2 ] = vz;

		_color.set( color );
		this.baseColors[ o ] = _color.r;
		this.baseColors[ o + 1 ] = _color.g;
		this.baseColors[ o + 2 ] = _color.b;

		this.life[ i ] = life;
		this.maxLife[ i ] = life;
		this.baseSize[ i ] = size;
		this.gravity[ i ] = gravity;

	}

	burst( pos, count, { color = 0xffcc55, speed = 6, size = 0.35, life = 0.5, gravity = - 12, up = 2, spread = 1 } = {} ) {

		for ( let n = 0; n < count; n ++ ) {

			const a = Math.random() * Math.PI * 2;
			const s = speed * ( 0.3 + Math.random() * 0.7 );
			this.emit(
				pos.x + ( Math.random() - 0.5 ) * 0.2 * spread,
				pos.y + Math.random() * 0.2,
				pos.z + ( Math.random() - 0.5 ) * 0.2 * spread,
				Math.cos( a ) * s, up * ( 0.5 + Math.random() ), Math.sin( a ) * s,
				Array.isArray( color ) ? color[ ( Math.random() * color.length ) | 0 ] : color,
				size * ( 0.6 + Math.random() * 0.8 ),
				life * ( 0.6 + Math.random() * 0.8 ),
				gravity
			);

		}

	}

	sparks( pos, normal, intensity ) {

		const count = Math.min( 60, 8 + intensity * 5 ) | 0;

		for ( let n = 0; n < count; n ++ ) {

			const s = 3 + Math.random() * ( 3 + intensity );
			const side = Math.random() < 0.5 ? 1 : - 1;
			const nx = normal ? normal.x * side : 0;
			const nz = normal ? normal.z * side : 0;
			this.emit(
				pos.x, pos.y, pos.z,
				( nx + ( Math.random() - 0.5 ) * 1.6 ) * s,
				1.5 + Math.random() * 4,
				( nz + ( Math.random() - 0.5 ) * 1.6 ) * s,
				Math.random() < 0.3 ? 0xffffff : Math.random() < 0.6 ? 0xffd04a : 0xff7a1a,
				0.15 + Math.random() * 0.25,
				0.25 + Math.random() * 0.45,
				- 18
			);

		}

	}

	explosion( pos ) {

		this.burst( pos, 70, { color: [ 0xff5a1a, 0xffb02e, 0xffe27a, 0xff2a0a ], speed: 7, size: 0.9, life: 0.7, gravity: - 4, up: 4 } );
		this.burst( pos, 25, { color: 0xffffff, speed: 10, size: 0.3, life: 0.35, gravity: - 15, up: 5 } );

	}

	update( dt ) {

		for ( let i = 0; i < POOL_SIZE; i ++ ) {

			const o = i * 3;

			if ( this.life[ i ] <= 0 ) {

				if ( this.sizes[ i ] !== 0 ) this.sizes[ i ] = 0;
				continue;

			}

			this.life[ i ] -= dt;
			const t = Math.max( 0, this.life[ i ] / this.maxLife[ i ] );

			this.velocities[ o + 1 ] += this.gravity[ i ] * dt;
			const drag = 1 - dt * 2.5;
			this.velocities[ o ] *= drag;
			this.velocities[ o + 2 ] *= drag;

			this.positions[ o ] += this.velocities[ o ] * dt;
			this.positions[ o + 1 ] += this.velocities[ o + 1 ] * dt;
			this.positions[ o + 2 ] += this.velocities[ o + 2 ] * dt;

			if ( this.positions[ o + 1 ] < - 0.1 ) {

				this.positions[ o + 1 ] = - 0.1;
				this.velocities[ o + 1 ] *= - 0.3;

			}

			this.colors[ o ] = this.baseColors[ o ] * t;
			this.colors[ o + 1 ] = this.baseColors[ o + 1 ] * t;
			this.colors[ o + 2 ] = this.baseColors[ o + 2 ] * t;
			this.sizes[ i ] = this.baseSize[ i ] * ( 0.4 + t * 0.6 );

		}

		this.posAttr.needsUpdate = true;
		this.colAttr.needsUpdate = true;
		this.sizeAttr.needsUpdate = true;

	}

}
