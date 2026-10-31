# 22: Async images, speakers without headphones and a more visual tutor

## Prompt (verbatim, Portuguese; the pasted Codex transcript is summarised in brackets)

> Seguinte, amigo: tinha começado essa feature aí em outro provedor, que é o Codex, e eu queria que você prosseguisse nela e finalizasse. Era basicamente o fluxo de ajeitar as imagens. Tava demorando bastante. Enfim, tinha mais alguma solução que eu queria que você me relembrasse qual era, mas eu queria que você fizesse esse PR a partir da main, por favor. 
>
> Eu queria que você fosse muito mais proativo no sentido de gerar mais imagens. Além disso, eu queria que você também circulasse mais as coisas, porque isso torna o processo de educação bem mais intuitivo. Eu acho que nosso engine está escrevendo muito e está sendo pouco intuitivo. Então, se você conseguisse ser mais visual, seria melhor, tá?
>
> [pasted: a Codex transcript. It says: "Show, isso é uma boa solução, tá? Eu queria que você juntasse essa solução com a solução do autofalante para evitar usar o fone de ouvido. No mesmo PR eu queria que você me trouxesse essas duas coisas. Principalmente a geração de imagem precisa ser algo meio que assíncrono: não precisa depender da pessoa esperar o speak para poder colocar a imagem na tela. Assim que você tiver a imagem, já pode colocar na tela". Codex then planned one PR with two blocks (draw_result applied outside the speech queue; barge-in tolerant to the tutor's own audio: browser AEC + transcript confirmation), committed the image part (0331a86, queue.ts and queue.test.ts) and stopped at its usage limit with the voice classifier test written.]

## What was done

- New branch from `main`: `feat/whiteboard-async-images-barge-in`. Codex's image commit cherry-picked (`draw_result` out of the speech queue) and its voice proof of concept ported (`barge-in.ts`).
- Voice: the mic stays open while the tutor talks; captions decide (`judgeCaption`); echo is dropped; different words cut the tutor (D60).
- Tutor prompt: draw first for every new person, place or object; circle the key word of the block being explained; short board text.
- Docs: D60, rendering guide §6, hand-off §9.
