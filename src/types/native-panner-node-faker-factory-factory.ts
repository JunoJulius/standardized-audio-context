import { TConnectNativeAudioNodeToNativeAudioNodeFunction } from './connect-native-audio-node-to-native-audio-node-function';
import { TInvalidStateErrorFactory } from './invalid-state-error-factory';
import { TNativeAudioNodeFactory } from './native-audio-node-factory';
import { TNativeChannelMergerNodeFactory } from './native-channel-merger-node-factory';
import { TNativeGainNodeFactory } from './native-gain-node-factory';
import { TNativePannerNodeFakerFactory } from './native-panner-node-faker-factory';
import { TNativeScriptProcessorNodeFactory } from './native-script-processor-node-factory';
import { TNativeWaveShaperNodeFactory } from './native-wave-shaper-node-factory';
import { TNotSupportedErrorFactory } from './not-supported-error-factory';

export type TNativePannerNodeFakerFactoryFactory = (
    connectNativeAudioNodeToNativeAudioNode: TConnectNativeAudioNodeToNativeAudioNodeFunction,
    createInvalidStateError: TInvalidStateErrorFactory,
    createNativeAudioNode: TNativeAudioNodeFactory,
    createNativeChannelMergerNode: TNativeChannelMergerNodeFactory,
    createNativeGainNode: TNativeGainNodeFactory,
    createNativeScriptProcessorNode: TNativeScriptProcessorNodeFactory,
    createNativeWaveShaperNode: TNativeWaveShaperNodeFactory,
    createNotSupportedError: TNotSupportedErrorFactory
) => TNativePannerNodeFakerFactory;
