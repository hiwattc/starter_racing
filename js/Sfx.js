// Small synthesized one-shots for race events (no samples needed)
export class Sfx {

	constructor( ctx ) {

		this.ctx = ctx;
		this.master = ctx.createGain();
		this.master.gain.value = 0.5;
		this.master.connect( ctx.destination );

		const len = ctx.sampleRate;
		this.noise = ctx.createBuffer( 1, len, ctx.sampleRate );
		const data = this.noise.getChannelData( 0 );
		for ( let i = 0; i < len; i ++ ) data[ i ] = Math.random() * 2 - 1;

	}

	get ready() {

		return this.ctx.state === 'running';

	}

	tone( freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0 } = {} ) {

		if ( ! this.ready ) return;
		const t = this.ctx.currentTime + delay;
		const osc = this.ctx.createOscillator();
		const g = this.ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime( freq, t );
		if ( slide ) osc.frequency.exponentialRampToValueAtTime( Math.max( 20, freq + slide ), t + dur );
		g.gain.setValueAtTime( vol, t );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + dur );
		osc.connect( g ).connect( this.master );
		osc.start( t );
		osc.stop( t + dur + 0.02 );

	}

	noiseBurst( dur, { vol = 0.4, from = 4000, to = 200, type = 'lowpass', delay = 0 } = {} ) {

		if ( ! this.ready ) return;
		const t = this.ctx.currentTime + delay;
		const src = this.ctx.createBufferSource();
		src.buffer = this.noise;
		const f = this.ctx.createBiquadFilter();
		f.type = type;
		f.frequency.setValueAtTime( from, t );
		f.frequency.exponentialRampToValueAtTime( to, t + dur );
		const g = this.ctx.createGain();
		g.gain.setValueAtTime( vol, t );
		g.gain.exponentialRampToValueAtTime( 0.0001, t + dur );
		src.connect( f ).connect( g ).connect( this.master );
		src.start( t, Math.random() * 0.5 );
		src.stop( t + dur + 0.02 );

	}

	countdown( go ) {

		this.tone( go ? 880 : 440, go ? 0.6 : 0.25, { type: 'square', vol: 0.15 } );

	}

	pickup() {

		[ 660, 880, 1175 ].forEach( ( f, i ) => this.tone( f, 0.12, { type: 'triangle', vol: 0.18, delay: i * 0.05 } ) );

	}

	tick() {

		this.tone( 1400, 0.03, { type: 'square', vol: 0.05 } );

	}

	itemReady() {

		this.tone( 1046, 0.15, { type: 'triangle', vol: 0.2 } );
		this.tone( 1568, 0.25, { type: 'triangle', vol: 0.2, delay: 0.08 } );

	}

	boost() {

		this.noiseBurst( 0.8, { vol: 0.35, from: 300, to: 3000, type: 'bandpass' } );
		this.tone( 120, 0.6, { type: 'sawtooth', vol: 0.12, slide: 300 } );

	}

	shield() {

		this.tone( 300, 0.5, { type: 'sine', vol: 0.25, slide: 900 } );

	}

	launch() {

		this.noiseBurst( 0.5, { vol: 0.3, from: 6000, to: 600 } );
		this.tone( 600, 0.4, { type: 'sawtooth', vol: 0.08, slide: - 400 } );

	}

	explosion( vol = 1 ) {

		this.noiseBurst( 1.0, { vol: 0.7 * vol, from: 2500, to: 60 } );
		this.tone( 90, 0.6, { type: 'sine', vol: 0.5 * vol, slide: - 60 } );

	}

	crash( vol = 1 ) {

		this.noiseBurst( 0.25, { vol: 0.35 * vol, from: 5000, to: 400 } );
		this.tone( 160, 0.15, { type: 'square', vol: 0.08 * vol, slide: - 100 } );

	}

	splat() {

		this.noiseBurst( 0.4, { vol: 0.3, from: 900, to: 100 } );
		this.tone( 220, 0.5, { type: 'sine', vol: 0.2, slide: - 180 } );

	}

	spin() {

		this.tone( 700, 0.7, { type: 'triangle', vol: 0.12, slide: - 550 } );

	}

	lap() {

		[ 523, 659, 784, 1046 ].forEach( ( f, i ) => this.tone( f, 0.15, { type: 'square', vol: 0.1, delay: i * 0.08 } ) );

	}

	finish() {

		[ 523, 659, 784, 1046, 784, 1046 ].forEach( ( f, i ) => this.tone( f, 0.2, { type: 'square', vol: 0.12, delay: i * 0.12 } ) );

	}

}
