export class Controls {

	constructor() {

		this.keys = {};
		this.x = 0;
		this.z = 0;

		// Touch state
		this.touchActive = false;
		this.touchDirX = 0;
		this.touchDirY = 0;
		this.steerPointerId = null;
		this.steerStartX = 0;
		this.steerStartY = 0;

		// Racing actions
		this.touchTurbo = false;
		this.touchItem = false;
		this.prevItem = false;
		this.prevReset = false;
		this.itemQueued = false;
		this.resetQueued = false;

		window.addEventListener( 'keydown', ( e ) => {

			this.keys[ e.code ] = true;
			if ( e.code === 'Space' || e.code.startsWith( 'Arrow' ) ) e.preventDefault();

			// Latch taps so a press shorter than a frame isn't lost
			if ( ! e.repeat && ( e.code === 'Space' || e.code === 'KeyJ' ) ) this.itemQueued = true;
			if ( ! e.repeat && e.code === 'KeyR' ) this.resetQueued = true;

		} );
		window.addEventListener( 'keyup', ( e ) => this.keys[ e.code ] = false );
		window.addEventListener( 'blur', () => this.keys = {} );

		this.setupTouchUI();

	}

	setupTouchUI() {

		if ( ! ( 'ontouchstart' in window ) ) return;

		const css = document.createElement( 'style' );
		css.textContent = `
			.touch-controls { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
			.steer-zone { position: absolute; inset: 0; pointer-events: auto; touch-action: none; }
			.steer-base { position: absolute; width: 140px; height: 140px; margin: -70px 0 0 -70px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); display: none; }
			.touch-actions { position: absolute; right: 16px; bottom: 120px; display: flex; flex-direction: column; gap: 14px; pointer-events: auto; }
			.touch-btn { width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; font: 800 13px system-ui, sans-serif; color: #fff; background: rgba(0,0,0,0.35); border: 2px solid rgba(255,255,255,0.5); user-select: none; -webkit-user-select: none; touch-action: none; }
			.touch-btn.turbo { background: rgba(255,120,30,0.55); }
			.touch-btn.down { transform: scale(0.92); background: rgba(255,255,255,0.45); }
			.steer-knob { position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; background: rgba(255,255,255,0.35); }
		`;
		document.head.appendChild( css );

		const container = document.createElement( 'div' );
		container.className = 'touch-controls';

		const steerZone = document.createElement( 'div' );
		steerZone.className = 'steer-zone';

		const base = document.createElement( 'div' );
		base.className = 'steer-base';
		const knob = document.createElement( 'div' );
		knob.className = 'steer-knob';
		base.appendChild( knob );
		steerZone.appendChild( base );

		container.appendChild( steerZone );

		// Action buttons sit above the steering zone
		const actions = document.createElement( 'div' );
		actions.className = 'touch-actions';
		const makeButton = ( label, cls, prop ) => {

			const b = document.createElement( 'div' );
			b.className = 'touch-btn ' + cls;
			b.textContent = label;
			const set = ( v ) => ( e ) => {

				e.preventDefault();
				e.stopPropagation();
				this[ prop ] = v;
				b.classList.toggle( 'down', v );

			};
			b.addEventListener( 'pointerdown', set( true ) );
			b.addEventListener( 'pointerup', set( false ) );
			b.addEventListener( 'pointercancel', set( false ) );
			b.addEventListener( 'pointerleave', set( false ) );
			actions.appendChild( b );

		};
		makeButton( 'ITEM', 'item', 'touchItem' );
		makeButton( 'TURBO', 'turbo', 'touchTurbo' );
		container.appendChild( actions );

		document.body.appendChild( container );

		const steerRange = 40;

		steerZone.addEventListener( 'pointerdown', ( e ) => {

			if ( this.steerPointerId !== null ) return;
			steerZone.setPointerCapture( e.pointerId );
			this.steerPointerId = e.pointerId;
			this.steerStartX = e.clientX;
			this.steerStartY = e.clientY;
			this.touchActive = true;
			this.touchDirX = 0;
			this.touchDirY = 0;
			base.style.left = `${ e.clientX }px`;
			base.style.top = `${ e.clientY }px`;
			base.style.display = 'block';

		} );

		steerZone.addEventListener( 'pointermove', ( e ) => {

			if ( e.pointerId !== this.steerPointerId ) return;
			let dx = ( e.clientX - this.steerStartX ) / steerRange;
			let dy = ( e.clientY - this.steerStartY ) / steerRange;
			const mag = Math.sqrt( dx * dx + dy * dy );

			if ( mag > 1 ) {

				dx /= mag;
				dy /= mag;

			}

			this.touchDirX = dx;
			this.touchDirY = dy;
			knob.style.transform = `translate(${ this.touchDirX * 60 }px, ${ this.touchDirY * 60 }px)`;

		} );

		const endSteer = ( e ) => {

			if ( e.pointerId !== this.steerPointerId ) return;
			this.steerPointerId = null;
			this.touchActive = false;
			this.touchDirX = 0;
			this.touchDirY = 0;
			knob.style.transform = '';
			base.style.display = 'none';

		};

		steerZone.addEventListener( 'pointerup', endSteer );
		steerZone.addEventListener( 'pointercancel', endSteer );

	}

	update() {

		let x = 0, z = 0;
		let turbo = this.touchTurbo;
		let item = this.touchItem;
		let reset = false;

		// Keyboard

		if ( this.keys[ 'KeyA' ] || this.keys[ 'ArrowLeft' ] ) x -= 1;
		if ( this.keys[ 'KeyD' ] || this.keys[ 'ArrowRight' ] ) x += 1;
		if ( this.keys[ 'KeyW' ] || this.keys[ 'ArrowUp' ] ) z += 1;
		if ( this.keys[ 'KeyS' ] || this.keys[ 'ArrowDown' ] ) z -= 1;
		if ( this.keys[ 'ShiftLeft' ] || this.keys[ 'ShiftRight' ] || this.keys[ 'KeyK' ] ) turbo = true;
		if ( this.keys[ 'Space' ] || this.keys[ 'KeyJ' ] ) item = true;
		if ( this.keys[ 'KeyR' ] ) reset = true;

		// Gamepad

		const gamepads = navigator.getGamepads();

		for ( const gp of gamepads ) {

			if ( ! gp ) continue;

			const stickX = gp.axes[ 0 ];
			if ( Math.abs( stickX ) > 0.15 ) x = stickX;

			const rt = gp.buttons[ 7 ] ? gp.buttons[ 7 ].value : 0;
			const lt = gp.buttons[ 6 ] ? gp.buttons[ 6 ].value : 0;

			if ( rt > 0.1 || lt > 0.1 ) z = rt - lt;

			if ( gp.buttons[ 0 ]?.pressed ) turbo = true;
			if ( gp.buttons[ 2 ]?.pressed || gp.buttons[ 1 ]?.pressed ) item = true;
			if ( gp.buttons[ 3 ]?.pressed ) reset = true;

			break;

		}

		// Touch — joystick mapped to world space (camera is 45° azimuth)

		if ( this.touchActive ) {

			const jx = this.touchDirX;
			const jy = this.touchDirY;
			const mag = Math.sqrt( jx * jx + jy * jy );

			if ( mag > 0.15 ) {

				x = ( jx + jy ) * Math.SQRT1_2 / mag;
				z = ( - jx + jy ) * Math.SQRT1_2 / mag;

			}

		}

		this.x = x;
		this.z = z;

		// Item and reset fire once per press
		const itemPressed = ( item && ! this.prevItem ) || this.itemQueued;
		const resetPressed = ( reset && ! this.prevReset ) || this.resetQueued;
		this.itemQueued = false;
		this.resetQueued = false;
		this.prevItem = item;
		this.prevReset = reset;

		return { x, z, touchActive: this.touchActive, turbo, item: itemPressed, reset: resetPressed };

	}

}
