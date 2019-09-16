import { EventTarget } from '../event-target';
import { AUDIO_NODE_STORE, EVENT_LISTENERS } from '../globals';
import { isAudioNode } from '../guards/audio-node';
import { isAudioNodeOutputConnection } from '../guards/audio-node-output-connection';
import { isAudioWorkletNode } from '../guards/audio-worklet-node';
import { connectNativeAudioNodeToNativeAudioNode } from '../helpers/connect-native-audio-node-to-native-audio-node';
import { deleteEventListenerOfAudioNode } from '../helpers/delete-event-listeners-of-audio-node';
import { disconnectNativeAudioNodeFromNativeAudioNode } from '../helpers/disconnect-native-audio-node-from-native-audio-node';
import { getAudioNodeConnections } from '../helpers/get-audio-node-connections';
import { getAudioParamConnections } from '../helpers/get-audio-param-connections';
import { getEventListenersOfAudioNode } from '../helpers/get-event-listeners-of-audio-node';
import { getNativeAudioNode } from '../helpers/get-native-audio-node';
import { getNativeAudioParam } from '../helpers/get-native-audio-param';
import { getValueForKey } from '../helpers/get-value-for-key';
import { insertElementInSet } from '../helpers/insert-element-in-set';
import { isActiveAudioNode } from '../helpers/is-active-audio-node';
import { isPartOfACycle } from '../helpers/is-part-of-a-cycle';
import { isPassiveAudioNode } from '../helpers/is-passive-audio-node';
import { pickElementFromSet } from '../helpers/pick-element-from-set';
import { setInternalStateToActive } from '../helpers/set-internal-state-to-active';
import { setInternalStateToPassiveWhenNecessary } from '../helpers/set-internal-state-to-passive-when-necessary';
import { testAudioNodeDisconnectMethodSupport } from '../helpers/test-audio-node-disconnect-method-support';
import { visitEachAudioNodeOnce } from '../helpers/visit-each-audio-node-once';
import { wrapAudioNodeDisconnectMethod } from '../helpers/wrap-audio-node-disconnect-method';
import {
    IAudioNode,
    IAudioNodeRenderer,
    IAudioParam,
    IMinimalBaseAudioContext,
    IMinimalOfflineAudioContext,
    INativeAudioNodeFaker
} from '../interfaces';
import {
    TActiveInputConnection,
    TAudioNodeConstructorFactory,
    TChannelCountMode,
    TChannelInterpretation,
    TInternalStateEventListener,
    TNativeAudioNode,
    TNativeAudioParam,
    TNativeAudioWorkletNode,
    TPassiveAudioNodeInputConnection,
    TPassiveAudioParamInputConnection
} from '../types';

const addActiveInputConnectionToAudioNode = <T extends IMinimalBaseAudioContext>(
    activeInputs: Set<TActiveInputConnection<T>>[],
    source: IAudioNode<T>,
    [ output, input, eventListener ]: TPassiveAudioNodeInputConnection<T>,
    ignoreDuplicates: boolean
) => {
    insertElementInSet(
        activeInputs[input],
        [ source, output, eventListener ],
        (activeInputConnection) => (activeInputConnection[0] === source && activeInputConnection[1] === output),
        ignoreDuplicates
    );
};

const addActiveInputConnectionToAudioParam = <T extends IMinimalBaseAudioContext>(
    activeInputs: Set<TActiveInputConnection<T>>,
    source: IAudioNode<T>,
    [ output, eventListener ]: TPassiveAudioParamInputConnection<T>,
    ignoreDuplicates: boolean
) => {
    insertElementInSet(
        activeInputs,
        [ source, output, eventListener ],
        (activeInputConnection) => (activeInputConnection[0] === source && activeInputConnection[1] === output),
        ignoreDuplicates
    );
};

const deleteActiveInputConnectionToAudioNode = <T extends IMinimalBaseAudioContext>(
    activeInputs: Set<TActiveInputConnection<T>>[],
    source: IAudioNode<T>,
    output: number,
    input: number
) => {
    return pickElementFromSet(
        activeInputs[input],
        (activeInputConnection) => (activeInputConnection[0] === source && activeInputConnection[1] === output)
    );
};

const deleteActiveInputConnectionToAudioParam = <T extends IMinimalBaseAudioContext>(
    activeInputs: Set<TActiveInputConnection<T>>,
    source: IAudioNode<T>,
    output: number
) => {
    return pickElementFromSet(
        activeInputs,
        (activeInputConnection) => (activeInputConnection[0] === source && activeInputConnection[1] === output)
    );
};

const addPassiveInputConnectionToAudioNode = <T extends IMinimalBaseAudioContext>(
    passiveInputs: WeakMap<IAudioNode<T>, Set<TPassiveAudioNodeInputConnection<T>>>,
    input: number,
    [ source, output, eventListener ]: TActiveInputConnection<T>,
    ignoreDuplicates: boolean
) => {
    const passiveInputConnections = passiveInputs.get(source);

    if (passiveInputConnections === undefined) {
        passiveInputs.set(source, new Set([ [ output, input, eventListener ] ]));
    } else {
        insertElementInSet(
            passiveInputConnections,
            [ output, input, eventListener ],
            (passiveInputConnection) => (passiveInputConnection[0] === output && passiveInputConnection[1] === input),
            ignoreDuplicates
        );
    }
};

const addPassiveInputConnectionToAudioParam = <T extends IMinimalBaseAudioContext>(
    passiveInputs: WeakMap<IAudioNode<T>, Set<TPassiveAudioParamInputConnection<T>>>,
    [ source, output, eventListener ]: TActiveInputConnection<T>,
    ignoreDuplicates: boolean
) => {
    const passiveInputConnections = passiveInputs.get(source);

    if (passiveInputConnections === undefined) {
        passiveInputs.set(source, new Set([ [ output, eventListener ] ]));
    } else {
        insertElementInSet(
            passiveInputConnections,
            [ output, eventListener ],
            (passiveInputConnection) => (passiveInputConnection[0] === output),
            ignoreDuplicates
        );
    }
};

const deletePassiveInputConnectionToAudioNode = <T extends IMinimalBaseAudioContext>(
    passiveInputs: WeakMap<IAudioNode<T>, Set<TPassiveAudioNodeInputConnection<T>>>,
    source: IAudioNode<T>,
    output: number,
    input: number
) => {
    const passiveInputConnections = getValueForKey(passiveInputs, source);
    const matchingConnection = pickElementFromSet(
        passiveInputConnections,
        (passiveInputConnection) => (passiveInputConnection[0] === output && passiveInputConnection[1] === input)
    );

    if (passiveInputConnections.size === 0) {
        passiveInputs.delete(source);
    }

    return matchingConnection;
};

const deletePassiveInputConnectionToAudioParam = <T extends IMinimalBaseAudioContext>(
    passiveInputs: WeakMap<IAudioNode<T>, Set<TPassiveAudioParamInputConnection<T>>>,
    source: IAudioNode<T>,
    output: number
) => {
    const passiveInputConnections = getValueForKey(passiveInputs, source);
    const matchingConnection = pickElementFromSet(
        passiveInputConnections,
        (passiveInputConnection) => (passiveInputConnection[0] === output)
    );

    if (passiveInputConnections.size === 0) {
        passiveInputs.delete(source);
    }

    return matchingConnection;
};

const addConnectionToAudioNodeOfAudioContext = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    destination: IAudioNode<T>,
    output: number,
    input: number
): boolean => {
    const { activeInputs, passiveInputs } = getAudioNodeConnections(destination);
    const { outputs } = getAudioNodeConnections(source);
    const eventListeners = getEventListenersOfAudioNode(source);

    const eventListener = <T extends IMinimalOfflineAudioContext ? null : TInternalStateEventListener> ((isActive) => {
        const nativeDestinationAudioNode = getNativeAudioNode(destination);
        const nativeSourceAudioNode = getNativeAudioNode(source);

        if (isActive) {
            const partialConnection = deletePassiveInputConnectionToAudioNode(passiveInputs, source, output, input);

            addActiveInputConnectionToAudioNode(activeInputs, source, partialConnection, false);

            if (!isPartOfACycle(source)) {
                connectNativeAudioNodeToNativeAudioNode(nativeSourceAudioNode, nativeDestinationAudioNode, output, input);
            }

            if (isPassiveAudioNode(destination)) {
                setInternalStateToActive(destination);
            }
        } else {
            const partialConnection = deleteActiveInputConnectionToAudioNode(activeInputs, source, output, input);

            addPassiveInputConnectionToAudioNode(passiveInputs, input, partialConnection, false);

            if (!isPartOfACycle(source)) {
                disconnectNativeAudioNodeFromNativeAudioNode(nativeSourceAudioNode, nativeDestinationAudioNode, output, input);
            }

            if (isActiveAudioNode(destination)) {
                setInternalStateToPassiveWhenNecessary(destination, activeInputs);
            }
        }
    });

    if (insertElementInSet(
        outputs,
        [ destination, output, input ],
        (outputConnection) => (outputConnection[0] === destination && outputConnection[1] === output && outputConnection[2] === input),
        true
    )) {
        eventListeners.add(eventListener);

        if (isActiveAudioNode(source)) {
            addActiveInputConnectionToAudioNode(activeInputs, source, [ output, input, eventListener ], true);
        } else {
            addPassiveInputConnectionToAudioNode(passiveInputs, input, [ source, output, eventListener ], true);
        }

        return true;
    }

    return false;
};

const addConnectionToAudioNodeOfOfflineAudioContext = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    destination: IAudioNode<T>,
    output: number,
    input: number
): boolean => {
    const { outputs } = getAudioNodeConnections(source);

    if (insertElementInSet(
        outputs,
        [ destination, output, input ],
        (outputConnection) => (outputConnection[0] === destination && outputConnection[1] === output && outputConnection[2] === input),
        true
    )) {
        const { activeInputs } = getAudioNodeConnections(destination);

        addActiveInputConnectionToAudioNode(activeInputs, source, <TPassiveAudioNodeInputConnection<T>> [ output, input, null ], true);

        return true;
    }

    return false;
};

const addConnectionToAudioParamOfAudioContext = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    destination: IAudioParam,
    output: number
): boolean => {
    const { activeInputs, passiveInputs } = getAudioParamConnections<T>(destination);
    const { outputs } = getAudioNodeConnections(source);
    const eventListeners = getEventListenersOfAudioNode(source);

    const eventListener = <T extends IMinimalOfflineAudioContext ? null : TInternalStateEventListener> ((isActive) => {
        const nativeAudioNode = getNativeAudioNode(source);
        const nativeAudioParam = getNativeAudioParam(destination);

        if (isActive) {
            const partialConnection = deletePassiveInputConnectionToAudioParam(passiveInputs, source, output);

            addActiveInputConnectionToAudioParam(activeInputs, source, partialConnection, false);

            if (!isPartOfACycle(source)) {
                nativeAudioNode.connect(nativeAudioParam, output);
            }
        } else {
            const partialConnection = deleteActiveInputConnectionToAudioParam(activeInputs, source, output);

            addPassiveInputConnectionToAudioParam(passiveInputs, partialConnection, false);

            if (!isPartOfACycle(source)) {
                nativeAudioNode.disconnect(nativeAudioParam, output);
            }
        }
    });

    if (insertElementInSet(
        outputs,
        [ destination, output ],
        (outputConnection) => (outputConnection[0] === destination && outputConnection[1] === output),
        true
    )) {
        eventListeners.add(eventListener);

        if (isActiveAudioNode(source)) {
            addActiveInputConnectionToAudioParam(activeInputs, source, [ output, eventListener ], true);
        } else {
            addPassiveInputConnectionToAudioParam(passiveInputs, [ source, output, eventListener ], true);
        }

        return true;
    }

    return false;
};

const addConnectionToAudioParamOfOfflineAudioContext = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    destination: IAudioParam,
    output: number
): boolean => {
    const { outputs } = getAudioNodeConnections(source);

    if (insertElementInSet(
        outputs,
        [ destination, output ],
        (outputConnection) => (outputConnection[0] === destination && outputConnection[1] === output),
        true
    )) {
        const { activeInputs } = getAudioParamConnections<T>(destination);

        addActiveInputConnectionToAudioParam(activeInputs, source, <TPassiveAudioParamInputConnection<T>> [ output, null ], true);

        return true;
    }

    return false;
};

const deleteActiveInputConnection = <T extends IMinimalBaseAudioContext>(
    activeInputConnections: Set<TActiveInputConnection<T>>,
    source: IAudioNode<T>,
    output: number
): null | TActiveInputConnection<T> => {
    for (const activeInputConnection of activeInputConnections) {
        if (activeInputConnection[0] === source && activeInputConnection[1] === output) {
            activeInputConnections.delete(activeInputConnection);

            return activeInputConnection;
        }
    }

    return null;
};

const deleteInputConnectionOfAudioNode = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    destination: IAudioNode<T>,
    output: number,
    input: number
): [ null | TInternalStateEventListener, boolean ] => {
    const { activeInputs, passiveInputs } = getAudioNodeConnections(destination);

    const activeInputConnection = deleteActiveInputConnection(activeInputs[input], source, output);

    if (activeInputConnection === null) {
        const passiveInputConnection = deletePassiveInputConnectionToAudioNode(passiveInputs, source, output, input);

        return [ passiveInputConnection[2], false ];
    }

    return [ activeInputConnection[2], true ];
};

const deleteInputConnectionOfAudioParam = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    destination: IAudioParam,
    output: number
): [ null | TInternalStateEventListener, boolean ] => {
    const { activeInputs, passiveInputs } = getAudioParamConnections<T>(destination);

    const activeInputConnection = deleteActiveInputConnection(activeInputs, source, output);

    if (activeInputConnection === null) {
        const passiveInputConnection = deletePassiveInputConnectionToAudioParam(passiveInputs, source, output);

        return [ passiveInputConnection[1], false ];
    }

    return [ activeInputConnection[2], true ];
};

const deleteInputsOfAudioNode = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    destination: IAudioNode<T>,
    output: number,
    input: number
) => {
    const [ listener, isActive ] = deleteInputConnectionOfAudioNode(source, destination, output, input);

    if (listener !== null) {
        deleteEventListenerOfAudioNode(source, listener);

        if (isActive) {
            disconnectNativeAudioNodeFromNativeAudioNode(
                getNativeAudioNode(source),
                getNativeAudioNode(destination),
                output,
                input
            );
        }
    }

    if (isActiveAudioNode(destination)) {
        const { activeInputs } = getAudioNodeConnections(destination);

        setInternalStateToPassiveWhenNecessary(destination, activeInputs);
    }
};

const deleteInputsOfAudioParam = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    destination: IAudioParam,
    output: number
) => {
    const [ listener, isActive ] = deleteInputConnectionOfAudioParam(source, destination, output);

    if (listener !== null) {
        deleteEventListenerOfAudioNode(source, listener);

        if (isActive) {
            getNativeAudioNode(source)
                .disconnect(getNativeAudioParam(destination), output);
        }
    }
};

const deleteAnyConnection = <T extends IMinimalBaseAudioContext>(source: IAudioNode<T>): (IAudioNode<T> | IAudioParam)[] => {
    const audioNodeConnectionsOfSource = getAudioNodeConnections(source);
    const destinations = [ ];

    for (const outputConnection of audioNodeConnectionsOfSource.outputs) {
        if (isAudioNodeOutputConnection(outputConnection)) {
            deleteInputsOfAudioNode(source, ...outputConnection);
        } else {
            deleteInputsOfAudioParam(source, ...outputConnection);
        }

        destinations.push(outputConnection[0]);
    }

    audioNodeConnectionsOfSource.outputs.clear();

    return destinations;
};

const deleteConnectionAtOutput = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    output: number
): (IAudioNode<T> | IAudioParam)[] => {
    const audioNodeConnectionsOfSource = getAudioNodeConnections(source);
    const destinations = [ ];

    for (const outputConnection of audioNodeConnectionsOfSource.outputs) {
        if (outputConnection[1] === output) {
            if (isAudioNodeOutputConnection(outputConnection)) {
                deleteInputsOfAudioNode(source, ...outputConnection);
            } else {
                deleteInputsOfAudioParam(source, ...outputConnection);
            }

            destinations.push(outputConnection[0]);
            audioNodeConnectionsOfSource.outputs.delete(outputConnection);
        }
    }

    return destinations;
};

const deleteConnectionToDestination = <T extends IMinimalBaseAudioContext>(
    source: IAudioNode<T>,
    destination: IAudioNode<T> | IAudioParam,
    output?: number,
    input?: number
): (IAudioNode<T> | IAudioParam)[] => {
    const audioNodeConnectionsOfSource = getAudioNodeConnections(source);

    return Array
        .from(audioNodeConnectionsOfSource.outputs)
        .filter((outputConnection) => (outputConnection[0] === destination
            && (output === undefined || outputConnection[1] === output)
            && (input === undefined || outputConnection[2] === input)))
        .map((outputConnection) => {
            if (isAudioNodeOutputConnection(outputConnection)) {
                deleteInputsOfAudioNode(source, ...outputConnection);
            } else {
                deleteInputsOfAudioParam(source, ...outputConnection);
            }

            audioNodeConnectionsOfSource.outputs.delete(outputConnection);

            return outputConnection[0];
        });
};

export const createAudioNodeConstructor: TAudioNodeConstructorFactory = (
    addAudioNodeConnections,
    auxiliaryGainNodeStore,
    cacheTestResult,
    createIncrementCycleCounter,
    createIndexSizeError,
    createInvalidAccessError,
    createNotSupportedError,
    decrementCycleCounter,
    detectCycles,
    getNativeContext,
    isNativeAudioNode,
    isNativeAudioParam,
    isNativeOfflineAudioContext
) => {

    return class AudioNode<T extends IMinimalBaseAudioContext> extends EventTarget implements IAudioNode<T> {

        private _context: T;

        private _nativeAudioNode: INativeAudioNodeFaker | TNativeAudioNode;

        constructor (
            context: T,
            isActive: boolean,
            nativeAudioNode: INativeAudioNodeFaker | TNativeAudioNode,
            audioNodeRenderer: T extends IMinimalOfflineAudioContext ? IAudioNodeRenderer<T, IAudioNode<T>> : null
        ) {
            super(nativeAudioNode);

            this._context = context;
            this._nativeAudioNode = nativeAudioNode;

            const nativeContext = getNativeContext(context);

            // Bug #12: Safari does not support to disconnect a specific destination.
            // @todo Make sure this is not used with an OfflineAudioContext.
            if (!isNativeOfflineAudioContext(nativeContext) && true !== cacheTestResult(testAudioNodeDisconnectMethodSupport, () => {
                return testAudioNodeDisconnectMethodSupport(nativeContext);
            })) {
                wrapAudioNodeDisconnectMethod(nativeAudioNode);
            }

            AUDIO_NODE_STORE.set(this, nativeAudioNode);
            EVENT_LISTENERS.set(this, new Set());

            if (isActive) {
                setInternalStateToActive(this);
            }

            addAudioNodeConnections(this, audioNodeRenderer, nativeAudioNode);
        }

        get channelCount (): number {
            return this._nativeAudioNode.channelCount;
        }

        set channelCount (value) {
            this._nativeAudioNode.channelCount = value;
        }

        get channelCountMode (): TChannelCountMode {
            return this._nativeAudioNode.channelCountMode;
        }

        set channelCountMode (value) {
            this._nativeAudioNode.channelCountMode = value;
        }

        get channelInterpretation (): TChannelInterpretation {
            return this._nativeAudioNode.channelInterpretation;
        }

        set channelInterpretation (value) {
            this._nativeAudioNode.channelInterpretation = value;
        }

        get context (): T {
            return this._context;
        }

        get numberOfInputs (): number {
            return this._nativeAudioNode.numberOfInputs;
        }

        get numberOfOutputs (): number {
            return this._nativeAudioNode.numberOfOutputs;
        }

        public connect <U extends IAudioNode<T>> (destinationNode: U, output?: number, input?: number): U;
        public connect (destinationParam: IAudioParam, output?: number): void;
        public connect <U extends IAudioNode<T>> (destination: U | IAudioParam, output = 0, input = 0): void | U { // tslint:disable-line:invalid-void max-line-length
            const nativeContext = getNativeContext(this._context);
            const isOffline = isNativeOfflineAudioContext(nativeContext);

            if (isNativeAudioNode(destination) || isNativeAudioParam(destination)) {
                throw createInvalidAccessError();
            }

            if (isAudioNode(destination)) {
                const nativeDestinationAudioNode = getNativeAudioNode(destination);

                try {
                    const connection = connectNativeAudioNodeToNativeAudioNode(
                        this._nativeAudioNode,
                        nativeDestinationAudioNode,
                        output,
                        input
                    );

                    if (isOffline || isPassiveAudioNode(this)) {
                        this._nativeAudioNode.disconnect(...connection);
                    } else if (isPassiveAudioNode(destination)) {
                        setInternalStateToActive(destination);
                    }

                    // An AudioWorklet needs a connection because it otherwise may truncate the input array.
                    // @todo Count the number of connections which depend on this auxiliary GainNode to know when it can be removed again.
                    if (isAudioWorkletNode(destination)) {
                        const auxiliaryGainNodes = auxiliaryGainNodeStore.get(<TNativeAudioWorkletNode> nativeDestinationAudioNode);

                        if (auxiliaryGainNodes === undefined) {
                            const nativeGainNode = nativeContext.createGain();

                            nativeGainNode.connect(connection[0], 0, connection[2]);

                            auxiliaryGainNodeStore.set(
                                <TNativeAudioWorkletNode> nativeDestinationAudioNode,
                                new Map([ [ input, nativeGainNode ] ])
                            );
                        } else if (auxiliaryGainNodes.get(input) === undefined) {
                            const nativeGainNode = nativeContext.createGain();

                            nativeGainNode.connect(connection[0], 0, connection[2]);

                            auxiliaryGainNodes.set(input, nativeGainNode);
                        }
                    }
                } catch (err) {
                    // Bug #41: Only Chrome, Firefox and Opera throw the correct exception by now.
                    if (err.code === 12) {
                        throw createInvalidAccessError();
                    }

                    throw err; // tslint:disable-line:rxjs-throw-error
                }

                const isNewConnectionToAudioNode = (isOffline)
                    ? addConnectionToAudioNodeOfOfflineAudioContext(this, destination, output, input)
                    : addConnectionToAudioNodeOfAudioContext(this, destination, output, input);

                if (isNewConnectionToAudioNode) {
                    const cycles = detectCycles(this, destination);

                    visitEachAudioNodeOnce(cycles, createIncrementCycleCounter(isOffline));
                }

                return destination;
            }

            const nativeAudioParam = getNativeAudioParam(destination);

            /*
             * Bug #147 & #153: Safari does not support to connect an input signal to the playbackRate AudioParam of an
             * AudioBufferSourceNode. This can't be easily detected and that's why the outdated name property is used here to identify
             * Safari.
             */
            if ((<TNativeAudioParam & { name: string }> nativeAudioParam).name === 'playbackRate') {
                throw createNotSupportedError();
            }

            try {
                this._nativeAudioNode.connect(nativeAudioParam, output);

                if (isOffline || isPassiveAudioNode(this)) {
                    this._nativeAudioNode.disconnect(nativeAudioParam, output);
                }
            } catch (err) {
                // Bug #58: Only Firefox does throw an InvalidStateError yet.
                if (err.code === 12) {
                    throw createInvalidAccessError();
                }

                throw err; // tslint:disable-line:rxjs-throw-error
            }

            const isNewConnectionToAudioParam = (isOffline)
                ? addConnectionToAudioParamOfOfflineAudioContext(this, destination, output)
                : addConnectionToAudioParamOfAudioContext(this, destination, output);

            if (isNewConnectionToAudioParam) {
                const cycles = detectCycles(this, destination);

                visitEachAudioNodeOnce(cycles, createIncrementCycleCounter(isOffline));
            }
        }

        public disconnect (output?: number): void;
        public disconnect (destinationNode: IAudioNode<T>, output?: number, input?: number): void;
        public disconnect (destinationParam: IAudioParam, output?: number): void;
        public disconnect (destinationOrOutput?: number | IAudioNode<T> | IAudioParam, output?: number, input?: number): void {
            let destinations: (IAudioNode<T> | IAudioParam)[];

            if (destinationOrOutput === undefined) {
                destinations = deleteAnyConnection(this);
            } else if (typeof destinationOrOutput === 'number') {
                if (destinationOrOutput < 0 || destinationOrOutput >= this.numberOfOutputs) {
                    throw createIndexSizeError();
                }

                destinations = deleteConnectionAtOutput(this, destinationOrOutput);
            } else {
                if (output !== undefined && (output < 0 || output >= this.numberOfOutputs)) {
                    throw createIndexSizeError();
                }

                if (isAudioNode(destinationOrOutput)
                        && input !== undefined
                        && (input < 0 || input >= destinationOrOutput.numberOfInputs)) {
                    throw createIndexSizeError();
                }

                destinations = deleteConnectionToDestination(this, destinationOrOutput, output, input);

                if (destinations.length === 0) {
                    throw createInvalidAccessError();
                }
            }

            for (const destination of destinations) {
                const cycles = detectCycles(this, destination);

                visitEachAudioNodeOnce(cycles, decrementCycleCounter);
            }
        }

    };

};
