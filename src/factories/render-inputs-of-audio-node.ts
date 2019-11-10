import { TRenderInputsOfAudioNodeFactory } from '../types';

export const createRenderInputsOfAudioNode: TRenderInputsOfAudioNodeFactory = (
    getAudioNodeConnections,
    getAudioNodeRenderer,
    isPartOfACycle
) => {
    return async (audioNode, nativeOfflineAudioContext, nativeAudioNode, trace) => {
        const audioNodeConnections = getAudioNodeConnections(audioNode);
        const nextTrace = [ ...trace, audioNode ];

        await Promise
            .all(audioNodeConnections.activeInputs
                .map((connections, input) => Array
                    .from(connections)
                    .filter(([ source ]) => !nextTrace.includes(source))
                    .map(async ([ source, output ]) => {
                        const audioNodeRenderer = getAudioNodeRenderer(source);
                        const renderedNativeAudioNode = await audioNodeRenderer.render(source, nativeOfflineAudioContext, nextTrace);

                        if (!isPartOfACycle(source) && !(audioNode === audioNode.context.destination && isPartOfACycle(audioNode))) {
                            renderedNativeAudioNode.connect(nativeAudioNode, output, input);
                        }
                    }))
                .reduce((allRenderingPromises, renderingPromises) => [ ...allRenderingPromises, ...renderingPromises ], [ ]));
    };
};
