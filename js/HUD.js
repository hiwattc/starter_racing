import { ITEM_INFO, ITEM_KEYS } from './Items.js';

const $ = ( id ) => document.getElementById( id );

export function formatTime( t ) {

	if ( t === null || t === undefined || ! Number.isFinite( t ) ) return '-';
	const m = Math.floor( t / 60 );
	const s = t - m * 60;
	return `${ m }:${ s.toFixed( 2 ).padStart( 5, '0' ) }`;

}

function ordinal( n ) {

	if ( n % 100 >= 11 && n % 100 <= 13 ) return 'th';
	return [ 'th', 'st', 'nd', 'rd' ][ n % 10 ] || 'th';

}

export class HUD {

	constructor( path, camRight, camForward ) {

		this.root = $( 'hud' );
		this.posNum = $( 'pos-num' );
		this.posSuffix = $( 'pos-suffix' );
		this.posTotal = $( 'pos-total' );
		this.lap = $( 'lap' );
		this.time = $( 'time' );
		this.best = $( 'best' );
		this.itemBox = $( 'item-box' );
		this.itemIcon = $( 'item-icon' );
		this.itemName = $( 'item-name' );
		this.standings = $( 'standings' );
		this.dash = $( 'dash' );
		this.speed = $( 'speed' );
		this.turboFill = $( 'turbo-fill' );
		this.centerMsg = $( 'center-msg' );
		this.toasts = $( 'toasts' );
		this.warning = $( 'warning' );
		this.speedlines = $( 'speedlines' );
		this.minimap = $( 'minimap' );
		this.mapCtx = this.minimap.getContext( '2d' );

		this.msgTimer = 0;
		this.standingsTimer = 0;
		this.rollIndex = 0;
		this.rollTimer = 0;
		this.last = {};

		this.buildMinimap( path, camRight, camForward );

	}

	show() {

		this.root.classList.remove( 'hidden' );

	}

	// Project the track into the camera-aligned frame so the map matches the screen
	buildMinimap( path, camRight, camForward ) {

		this.camRight = camRight;
		this.camForward = camForward;

		let minU = Infinity, maxU = - Infinity, minV = Infinity, maxV = - Infinity;

		for ( const p of path.points ) {

			const u = p.x * camRight.x + p.z * camRight.z;
			const v = p.x * camForward.x + p.z * camForward.z;
			minU = Math.min( minU, u ); maxU = Math.max( maxU, u );
			minV = Math.min( minV, v ); maxV = Math.max( maxV, v );

		}

		const size = this.minimap.width;
		const pad = 22;
		this.mapScale = ( size - pad * 2 ) / Math.max( maxU - minU, maxV - minV );
		this.mapOffU = ( minU + maxU ) / 2;
		this.mapOffV = ( minV + maxV ) / 2;
		this.mapPoints = path.points;

	}

	toMap( x, z ) {

		const u = x * this.camRight.x + z * this.camRight.z;
		const v = x * this.camForward.x + z * this.camForward.z;
		const size = this.minimap.width;
		return [ size / 2 + ( u - this.mapOffU ) * this.mapScale, size / 2 - ( v - this.mapOffV ) * this.mapScale ];

	}

	drawMinimap( racers, items ) {

		const ctx = this.mapCtx;
		const size = this.minimap.width;
		ctx.clearRect( 0, 0, size, size );

		ctx.lineJoin = 'round';
		ctx.beginPath();

		this.mapPoints.forEach( ( p, i ) => {

			const [ x, y ] = this.toMap( p.x, p.z );
			if ( i === 0 ) ctx.moveTo( x, y );
			else ctx.lineTo( x, y );

		} );

		ctx.closePath();
		ctx.strokeStyle = 'rgba(255,255,255,0.25)';
		ctx.lineWidth = 16;
		ctx.stroke();
		ctx.strokeStyle = 'rgba(255,255,255,0.75)';
		ctx.lineWidth = 3;
		ctx.stroke();

		// Finish line
		const f = this.mapPoints[ 0 ];
		const [ fx, fy ] = this.toMap( f.x, f.z );
		ctx.fillStyle = '#fff';
		ctx.fillRect( fx - 6, fy - 2, 12, 4 );

		for ( const b of items.boxes ) {

			if ( ! b.mesh.visible ) continue;
			const [ x, y ] = this.toMap( b.mesh.position.x, b.mesh.position.z );
			ctx.fillStyle = 'rgba(255,120,230,0.8)';
			ctx.fillRect( x - 1.5, y - 1.5, 3, 3 );

		}

		for ( const m of items.missiles ) {

			const [ x, y ] = this.toMap( m.mesh.position.x, m.mesh.position.z );
			ctx.fillStyle = '#ff3b2f';
			ctx.beginPath();
			ctx.arc( x, y, 3, 0, Math.PI * 2 );
			ctx.fill();

		}

		// Player drawn last so it sits on top
		const sorted = [ ...racers ].sort( ( a, b ) => a.isPlayer - b.isPlayer );

		for ( const r of sorted ) {

			const p = r.vehicle.spherePos;
			const [ x, y ] = this.toMap( p.x, p.z );
			ctx.beginPath();
			ctx.arc( x, y, r.isPlayer ? 7 : 5, 0, Math.PI * 2 );
			ctx.fillStyle = r.color;
			ctx.fill();
			ctx.lineWidth = r.isPlayer ? 3 : 1.5;
			ctx.strokeStyle = r.isPlayer ? '#fff' : 'rgba(0,0,0,0.6)';
			ctx.stroke();

		}

	}

	update( dt, player, racers, items, race ) {

		this.set( 'pos', player.rank + 1, ( v ) => {

			this.posNum.textContent = v;
			this.posSuffix.textContent = ordinal( v );

		} );
		this.set( 'total', racers.length, ( v ) => this.posTotal.textContent = v );
		this.set( 'lap', `${ Math.min( Math.max( player.crossings, 1 ), race.laps ) } / ${ race.laps }`, ( v ) => this.lap.textContent = v );
		this.time.textContent = formatTime( player.finished ? player.finishTime : race.time );
		this.set( 'best', player.bestLap, ( v ) => this.best.textContent = formatTime( v ) );

		const v = player.vehicle;
		const kmh = Math.round( Math.hypot( v.sphereVel.x, v.sphereVel.z ) * 9 );
		this.set( 'speed', kmh, ( s ) => this.speed.textContent = s );
		this.turboFill.style.width = v.turbo.toFixed( 1 ) + '%';
		this.set( 'boost', v.boosting, ( b ) => {

			this.dash.classList.toggle( 'boosting', b );
			this.speedlines.classList.toggle( 'on', b );

		} );

		this.set( 'warning', ( player.incoming || 0 ) > 0 && ! player.finished, ( w ) => this.warning.classList.toggle( 'hidden', ! w ) );

		this.updateItem( dt, player );

		this.standingsTimer -= dt;

		if ( this.standingsTimer <= 0 ) {

			this.standingsTimer = 0.25;
			this.updateStandings( racers );

		}

		this.drawMinimap( racers, items );

		if ( this.msgTimer > 0 ) {

			this.msgTimer -= dt;
			if ( this.msgTimer <= 0 ) this.centerMsg.classList.remove( 'show' );

		}

	}

	// Only touch the DOM when a value actually changes
	set( key, value, apply ) {

		if ( this.last[ key ] === value ) return;
		this.last[ key ] = value;
		apply( value );

	}

	updateItem( dt, player ) {

		if ( player.rolling > 0 ) {

			this.rollTimer -= dt;

			if ( this.rollTimer <= 0 ) {

				this.rollTimer = 0.07;
				this.rollIndex = ( this.rollIndex + 1 ) % ITEM_KEYS.length;
				this.itemIcon.textContent = ITEM_INFO[ ITEM_KEYS[ this.rollIndex ] ].icon;
				this.onTick?.();

			}

			this.set( 'item', 'rolling', () => {

				this.itemIcon.className = 'rolling';
				this.itemName.textContent = '???';
				this.itemBox.classList.remove( 'ready' );

			} );

			return;

		}

		this.set( 'item', player.item, ( item ) => {

			if ( item ) {

				this.itemIcon.className = '';
				this.itemIcon.textContent = ITEM_INFO[ item ].icon;
				this.itemName.textContent = ITEM_INFO[ item ].name;
				this.itemBox.classList.add( 'ready' );

			} else {

				this.itemIcon.className = 'empty';
				this.itemIcon.textContent = '';
				this.itemName.textContent = '아이템 없음';
				this.itemBox.classList.remove( 'ready' );

			}

		} );

	}

	updateStandings( racers ) {

		const sorted = [ ...racers ].sort( ( a, b ) => a.rank - b.rank );
		this.standings.innerHTML = sorted.map( ( r, i ) =>
			`<li class="${ r.isPlayer ? 'me' : '' } ${ r.finished ? 'done' : '' }">` +
			`<span class="n">${ i + 1 }</span><span class="dot" style="background:${ r.color }"></span>` +
			`<span>${ r.name }</span>${ r.finished ? '<span class="flag">🏁</span>' : '' }</li>`
		).join( '' );

	}

	message( text, { cls = '', duration = 1.2 } = {} ) {

		const el = this.centerMsg;
		el.className = '';
		void el.offsetWidth; // restart the pop animation
		el.textContent = text;
		el.className = 'show ' + cls;
		this.msgTimer = duration;

	}

	toast( text ) {

		const el = document.createElement( 'div' );
		el.className = 'toast';
		el.textContent = text;
		this.toasts.appendChild( el );
		while ( this.toasts.children.length > 3 ) this.toasts.firstChild.remove();
		setTimeout( () => el.remove(), 2300 );

	}

	showResults( racers, player, final ) {

		const sorted = [ ...racers ].sort( ( a, b ) => a.rank - b.rank );
		$( 'results' ).classList.remove( 'hidden' );
		$( 'results-title' ).textContent = `${ player.rank + 1 }위로 완주!` + ( player.rank === 0 ? ' 🏆' : player.rank < 3 ? ' 🎉' : '' );
		$( 'results-body' ).innerHTML = sorted.map( ( r, i ) =>
			`<tr class="${ r.isPlayer ? 'me' : '' }"><td>${ i + 1 }</td>` +
			`<td><span class="dot" style="background:${ r.color }"></span>${ r.name }</td>` +
			`<td>${ r.finished ? formatTime( r.finishTime ) : final ? 'DNF' : '주행 중…' }</td></tr>`
		).join( '' );

	}

	hideResults() {

		$( 'results' ).classList.add( 'hidden' );

	}

}
