# 30. Image storage, pods and CI/CD questions

## Prompts (verbatim, pt-BR)

> Uma dúvida: como é que estão sendo armazenadas as imagens, hein? Se eu gero uma sessão que tem imagem, só que aí eu não sei: finalizo ela. Depois, eu vou no histórico e entro na mesma sessão. Como é que a imagem vai renderizar lá? Como é que eu estou armazenando isso?

> Uma dúvida: eu tenho dois pods para subir que vão precisar de deploy. Isso vai eventualmente perder o diretório de imagens?

> Tu consegue pegar as imagens aí de alguma forma? Não sei. E aí, depois que eu subi o deploy, tu meio que recupera?

> Tem como pegar lá do render as imagens?

> O que é que a gente fez de CICD, amigão? Fala para mim.

> Mas, no caso, tem o CI/CD para o deploy também na Render, na Vercel, ou é algo que fica lá do lado deles? Porque acho que não precisa, né, do CI/CD. Eles já detectam e fazem o deploy.

> Tu pode criar um PR fazendo algum log só para a gente poder mergear na main, tipo o log dos prompts.

(Also asked for a 500-character platform description, written in the chat only.)

## What was found

- Generated images are files in `DATA_DIR/files/gen/<hash>.jpg` (`ImageStore`), served by `GET /api/gen/:file`. MongoDB stores only the relative URL and the prompt in the `draw` event.
- On Render (ephemeral disk) and with several pods (one disk each) the files are lost or served by only one pod. The 5 images referenced by Render sessions were already gone (HEAD returned no file); 37 images (33 MB) exist locally.
- Proposed (not started): move `ImageStore` to MongoDB, migrate local images, regenerate lost ones from the stored prompts once Gemini credits are back.
- CI only runs checks; Vercel and Render deploy on their own. Render's "After CI Checks Pass" waits for all GitHub checks, including Vercel's.
