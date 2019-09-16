import { TAudioParamFactory } from './audio-param-factory';
import { TGetNativeContextFunction } from './get-native-context-function';
import { TIsNativeOfflineAudioContextFunction } from './is-native-offline-audio-context-function';
import { TNativeStereoPannerNodeFactory } from './native-stereo-panner-node-factory';
import { TNoneAudioDestinationNodeConstructor } from './none-audio-destination-node-constructor';
import { TStereoPannerNodeConstructor } from './stereo-panner-node-constructor';
import { TStereoPannerNodeRendererFactory } from './stereo-panner-node-renderer-factory';

export type TStereoPannerNodeConstructorFactory = (
    createAudioParam: TAudioParamFactory,
    createNativeStereoPannerNode: TNativeStereoPannerNodeFactory,
    createStereoPannerNodeRenderer: TStereoPannerNodeRendererFactory,
    getNativeContext: TGetNativeContextFunction,
    isNativeOfflineAudioContext: TIsNativeOfflineAudioContextFunction,
    noneAudioDestinationNodeConstructor: TNoneAudioDestinationNodeConstructor
) => TStereoPannerNodeConstructor;
