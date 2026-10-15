import * as THREE from 'three';
import { CELL_RAW, GRID_SCALE } from './Track.js';

// Race circuits as ordered loops of grid cells (driving order).
// The first cell is the finish line; cars drive towards the second cell.
// The last cell must be a straight so the starting grid fits behind the line.

const row = ( z, fromX, toX ) => {

	const cells = [];
	const step = fromX <= toX ? 1 : - 1;
	for ( let x = fromX; x !== toX + step; x += step ) cells.push( [ x, z ] );
	return cells;

};

export const COURSES = [
	{
		id: 'forest',
		name: '포레스트 서킷',
		desc: '균형 잡힌 기본 코스',
		theme: { sky: 0xadb2ba, light: 0xffffff, lightIntensity: 3, hemiSky: 0xc8d8e8, hemiGround: 0x7a8a5a },
		loop: [
			[ 0, 0 ], [ 0, 1 ], [ 0, 2 ], [ 0, 3 ],
			[ - 1, 3 ], [ - 2, 3 ],
			[ - 2, 2 ],
			[ - 3, 2 ], [ - 4, 2 ],
			[ - 4, 3 ], [ - 4, 4 ],
			[ - 5, 4 ], [ - 6, 4 ], [ - 7, 4 ],
			[ - 7, 3 ], [ - 7, 2 ], [ - 7, 1 ], [ - 7, 0 ], [ - 7, - 1 ],
			[ - 6, - 1 ], [ - 5, - 1 ],
			[ - 5, - 2 ], [ - 5, - 3 ],
			[ - 4, - 3 ], [ - 3, - 3 ], [ - 2, - 3 ], [ - 1, - 3 ],
			[ 0, - 3 ], [ 0, - 2 ], [ 0, - 1 ],
		],
	},
	{
		id: 'speedway',
		name: '선셋 스피드웨이',
		desc: '긴 직선과 시케인 · 터보 승부',
		theme: { sky: 0xf0b98a, light: 0xffd2a0, lightIntensity: 3.2, hemiSky: 0xffc9a0, hemiGround: 0x8a6a4a },
		loop: [
			[ 0, 0 ], [ 0, 1 ], [ 0, 2 ], [ 0, 3 ],
			...row( 3, - 1, - 3 ),
			[ - 3, 4 ], ...row( 4, - 4, - 6 ),
			[ - 6, 3 ], ...row( 3, - 7, - 9 ),
			[ - 9, 2 ], [ - 9, 1 ], [ - 9, 0 ], [ - 9, - 1 ], [ - 9, - 2 ],
			...row( - 2, - 8, 0 ),
			[ 0, - 1 ],
		],
	},
	{
		id: 'canyon',
		name: '트와일라잇 캐년',
		desc: '헤어핀 연속 · 테크니컬 코스',
		theme: { sky: 0x7f88aa, light: 0xc8d4ff, lightIntensity: 2.4, hemiSky: 0x9aa8d8, hemiGround: 0x4a5a5a },
		loop: [
			[ 0, 0 ], [ 0, 1 ], [ 0, 2 ],
			[ - 1, 2 ], [ - 2, 2 ],
			[ - 2, 3 ], [ - 2, 4 ],
			[ - 3, 4 ], [ - 4, 4 ], [ - 5, 4 ],
			[ - 5, 3 ], [ - 4, 3 ],
			[ - 4, 2 ], [ - 4, 1 ], [ - 4, 0 ],
			[ - 5, 0 ], [ - 6, 0 ],
			[ - 6, - 1 ], [ - 6, - 2 ], [ - 6, - 3 ],
			[ - 5, - 3 ], [ - 4, - 3 ],
			[ - 4, - 2 ], [ - 3, - 2 ],
			[ - 3, - 3 ], [ - 3, - 4 ],
			[ - 2, - 4 ], [ - 1, - 4 ], [ 0, - 4 ],
			[ 0, - 3 ], [ 0, - 2 ], [ 0, - 1 ],
		],
	},
];

export function getCourse( key ) {

	return COURSES.find( ( c ) => c.id === key ) || COURSES[ 0 ];

}

const CELL = CELL_RAW * GRID_SCALE;
const HALF = CELL / 2;

// Corner orientation keyed by the two open sides (see Physics.js arc centers)
const CORNER_ORIENT = { '-x+z': 0, '+x+z': 16, '+x-z': 10, '-x-z': 22 };

function sideName( dx, dz ) {

	if ( dx === 1 ) return '+x';
	if ( dx === - 1 ) return '-x';
	if ( dz === 1 ) return '+z';
	return '-z';

}

// Godot-style GridMap cells ([gx, gz, piece, orient]) from the loop.
export function loopToCells( loop ) {

	const cells = [];
	const n = loop.length;

	for ( let i = 0; i < n; i ++ ) {

		const [ gx, gz ] = loop[ i ];
		const [ px, pz ] = loop[ ( i - 1 + n ) % n ];
		const [ nx, nz ] = loop[ ( i + 1 ) % n ];

		const dpx = px - gx, dpz = pz - gz;
		const dnx = nx - gx, dnz = nz - gz;

		if ( dpx === - dnx && dpz === - dnz ) {

			if ( i === 0 ) {

				// Finish line faces the driving direction
				const orient = dnz === 1 ? 0 : dnz === - 1 ? 10 : dnx === 1 ? 16 : 22;
				cells.push( [ gx, gz, 'track-finish', orient ] );

			} else {

				cells.push( [ gx, gz, 'track-straight', dnz !== 0 ? 0 : 16 ] );

			}

		} else {

			const sides = [ sideName( dpx, dpz ), sideName( dnx, dnz ) ].sort( ( a, b ) => ( a[ 1 ] === 'x' ? - 1 : 1 ) - ( b[ 1 ] === 'x' ? - 1 : 1 ) );
			cells.push( [ gx, gz, 'track-corner', CORNER_ORIENT[ sides.join( '' ) ] ] );

		}

	}

	return cells;

}

// Dense centerline through the loop. Index 0 is the finish line.
export class TrackPath {

	constructor( loop ) {

		this.points = [];
		const n = loop.length;
		const center = ( gx, gz ) => new THREE.Vector3( ( gx + 0.5 ) * CELL, 0, ( gz + 0.5 ) * CELL );

		for ( let i = 0; i < n; i ++ ) {

			const [ gx, gz ] = loop[ i ];
			const [ px, pz ] = loop[ ( i - 1 + n ) % n ];
			const [ nx, nz ] = loop[ ( i + 1 ) % n ];
			const c = center( gx, gz );
			const dp = new THREE.Vector3( px - gx, 0, pz - gz );
			const dn = new THREE.Vector3( nx - gx, 0, nz - gz );

			if ( dp.x === - dn.x && dp.z === - dn.z ) {

				// Straight: center, then mid-exit
				this.points.push( c.clone() );
				this.points.push( c.clone().addScaledVector( dn, HALF * 0.5 ) );

			} else {

				// Corner: arc of radius HALF around the inner corner
				const corner = c.clone().addScaledVector( dp, HALF ).addScaledVector( dn, HALF );
				const steps = 4;

				for ( let s = 1; s < steps; s ++ ) {

					const t = ( s / steps ) * Math.PI / 2;
					this.points.push( corner.clone()
						.addScaledVector( dn, - HALF * Math.cos( t ) )
						.addScaledVector( dp, - HALF * Math.sin( t ) ) );

				}

			}

			// Boundary with the next cell
			this.points.push( c.clone().addScaledVector( dn, HALF ) );

		}

		this.count = this.points.length;
		this.tangents = [];
		this.rights = [];
		this.segLengths = [];
		this.curvature = [];

		for ( let i = 0; i < this.count; i ++ ) {

			const prev = this.points[ ( i - 1 + this.count ) % this.count ];
			const next = this.points[ ( i + 1 ) % this.count ];
			const t = next.clone().sub( prev ).normalize();
			this.tangents.push( t );
			// Right-hand side when facing the tangent (forward +z => right -x)
			this.rights.push( new THREE.Vector3( - t.z, 0, t.x ) );
			this.segLengths.push( this.points[ i ].distanceTo( next ) );

		}

		for ( let i = 0; i < this.count; i ++ ) {

			const a = this.tangents[ i ];
			const b = this.tangents[ ( i + 3 ) % this.count ];
			this.curvature.push( Math.acos( THREE.MathUtils.clamp( a.dot( b ), - 1, 1 ) ) );

		}

		this.length = this.segLengths.reduce( ( a, b ) => a + b, 0 );
		this.halfWidth = 4.75 * GRID_SCALE - 0.25;

	}

	// Nearest waypoint searching around a hint index (keeps progress continuous)
	nearest( pos, hint, back = 4, ahead = 8 ) {

		let best = hint, bestD = Infinity;

		for ( let k = - back; k <= ahead; k ++ ) {

			const i = ( hint + k + this.count ) % this.count;
			const p = this.points[ i ];
			const d = ( p.x - pos.x ) ** 2 + ( p.z - pos.z ) ** 2;
			if ( d < bestD ) {

				bestD = d;
				best = i;

			}

		}

		return { index: best, dist: Math.sqrt( bestD ) };

	}

	nearestGlobal( pos ) {

		return this.nearest( pos, 0, 0, this.count - 1 );

	}

	// Fraction of the way from waypoint i to i+1
	fraction( pos, i ) {

		const a = this.points[ i ];
		const b = this.points[ ( i + 1 ) % this.count ];
		const abx = b.x - a.x, abz = b.z - a.z;
		const len2 = abx * abx + abz * abz;
		if ( len2 === 0 ) return 0;
		return THREE.MathUtils.clamp( ( ( pos.x - a.x ) * abx + ( pos.z - a.z ) * abz ) / len2, - 0.5, 1 );

	}

	// Walk forward `distance` units from waypoint i
	walk( i, distance ) {

		let idx = i;
		let remaining = distance;

		while ( remaining > 0 ) {

			remaining -= this.segLengths[ idx ];
			idx = ( idx + 1 ) % this.count;

		}

		return idx;

	}

	// Spawn heading (yaw) at waypoint i
	yawAt( i ) {

		const t = this.tangents[ i ];
		return Math.atan2( t.x, t.z );

	}

}
