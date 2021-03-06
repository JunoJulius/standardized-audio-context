import { setInternalStateToActive } from '../helpers/set-internal-state-to-active';
import { setInternalStateToPassive } from '../helpers/set-internal-state-to-passive';
import { IAudioParam, IMinimalOfflineAudioContext, IOscillatorNode, IOscillatorNodeRenderer, IOscillatorOptions } from '../interfaces';
import {
    TContext,
    TEndedEventHandler,
    TNativeOscillatorNode,
    TOscillatorNodeConstructorFactory,
    TOscillatorNodeRenderer,
    TOscillatorType
} from '../types';

const DEFAULT_OPTIONS = {
    channelCount: 2,
    channelCountMode: 'max', // This attribute has no effect for nodes with no inputs.
    channelInterpretation: 'speakers', // This attribute has no effect for nodes with no inputs.
    detune: 0,
    frequency: 440,
    type: 'sine'
} as const;

export const createOscillatorNodeConstructor: TOscillatorNodeConstructorFactory = (
    audioNodeConstructor,
    createAudioParam,
    createInvalidStateError,
    createNativeOscillatorNode,
    createOscillatorNodeRenderer,
    getNativeContext,
    isNativeOfflineAudioContext,
    wrapEventListener
) => {

    return class OscillatorNode<T extends TContext> extends audioNodeConstructor<T> implements IOscillatorNode<T> {

        private _detune: IAudioParam;

        private _frequency: IAudioParam;

        private _nativeOscillatorNode: TNativeOscillatorNode;

        private _onended: null | TEndedEventHandler<IOscillatorNode<T>>;

        private _oscillatorNodeRenderer: TOscillatorNodeRenderer<T>;

        constructor (context: T, options: Partial<IOscillatorOptions> = DEFAULT_OPTIONS) {
            const nativeContext = getNativeContext(context);
            const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
            const nativeOscillatorNode = createNativeOscillatorNode(nativeContext, mergedOptions);
            const isOffline = isNativeOfflineAudioContext(nativeContext);
            const oscillatorNodeRenderer = <TOscillatorNodeRenderer<T>> ((isOffline) ? createOscillatorNodeRenderer() : null);
            const nyquist = context.sampleRate / 2;

            super(context, false, nativeOscillatorNode, oscillatorNodeRenderer);

            // Bug #81: Edge, Firefox & Safari do not export the correct values for maxValue and minValue.
            this._detune = createAudioParam(this, isOffline, nativeOscillatorNode.detune, 153600, -153600);
            // Bug #76: Edge & Safari do not export the correct values for maxValue and minValue.
            this._frequency = createAudioParam(this, isOffline, nativeOscillatorNode.frequency, nyquist, -nyquist);
            this._nativeOscillatorNode = nativeOscillatorNode;
            this._onended = null;
            this._oscillatorNodeRenderer = oscillatorNodeRenderer;

            if (this._oscillatorNodeRenderer !== null && mergedOptions.periodicWave !== undefined) {
                (<IOscillatorNodeRenderer<IMinimalOfflineAudioContext>> this._oscillatorNodeRenderer).periodicWave =
                    mergedOptions.periodicWave;
            }
        }

        get detune (): IAudioParam {
            return this._detune;
        }

        get frequency (): IAudioParam {
            return this._frequency;
        }

        get onended (): null | TEndedEventHandler<IOscillatorNode<T>> {
            return this._onended;
        }

        set onended (value) {
            const wrappedListener = (typeof value === 'function') ? wrapEventListener(this, value) : null;

            this._nativeOscillatorNode.onended = wrappedListener;

            const nativeOnEnded = this._nativeOscillatorNode.onended;

            this._onended = (nativeOnEnded !== null && nativeOnEnded === wrappedListener)
                ? value
                : <null | TEndedEventHandler<IOscillatorNode<T>>> nativeOnEnded;
        }

        get type (): TOscillatorType {
            return this._nativeOscillatorNode.type;
        }

        set type (value) {
            this._nativeOscillatorNode.type = value;

            // Bug #57: Edge will not throw an error when assigning the type to 'custom'. But it still will change the value.
            if (value === 'custom') {
                throw createInvalidStateError();
            }

            if (this._oscillatorNodeRenderer !== null) {
                this._oscillatorNodeRenderer.periodicWave = null;
            }
        }

        public setPeriodicWave (periodicWave: PeriodicWave): void {
            this._nativeOscillatorNode.setPeriodicWave(periodicWave);

            if (this._oscillatorNodeRenderer !== null) {
                this._oscillatorNodeRenderer.periodicWave = periodicWave;
            }
        }

        public start (when = 0): void {
            this._nativeOscillatorNode.start(when);

            if (this._oscillatorNodeRenderer !== null) {
                this._oscillatorNodeRenderer.start = when;
            } else {
                setInternalStateToActive(this);

                const resetInternalStateToPassive = () => {
                    this._nativeOscillatorNode.removeEventListener('ended', resetInternalStateToPassive);

                    // @todo Determine a meaningful delay instead of just using one second.
                    setTimeout(() => setInternalStateToPassive(this), 1000);
                };

                this._nativeOscillatorNode.addEventListener('ended', resetInternalStateToPassive);
            }
        }

        public stop (when = 0): void {
            this._nativeOscillatorNode.stop(when);

            if (this._oscillatorNodeRenderer !== null) {
                this._oscillatorNodeRenderer.stop = when;
            }
        }

    };

};
