# Pitch de 5 minutos com demo ao vivo — Mento

> Roteiro em pt-BR (o produto e a plateia são brasileiros; o arquivo fica no repositório em inglês). Versão de 31/10/2026.
> Base: `docs/20-demo-runbook.md` (demo de História — Roma Antiga), `docs/business-plan/plano-de-negocios-mento.pdf` e a pesquisa de pitches no fim deste arquivo.
> **Tese do pitch: Desafio 3 da Teachy** — “usar IA no dia a dia de forma segura, economizando tempo e preservando a aprendizagem”. Dados do plano: Cetic.br 2024/2025, TALIS 2024, Bastani et al. (PNAS 2025), Gallup 2025 (ver `plano-de-negocios-mento.pdf`, seção 2).
> Regras de honestidade (AGENTS.md): **não há clientes, receita, pilotos nem eficácia comprovada.** Os alunos do painel do professor são **fictícios**. Diga isso em voz alta.

## 0. Antes de subir ao palco

| Item | Feito? |
|---|---|
| Ler as regras do hackathon: tempo exato (5 min cravados?), se haverá perguntas, critérios de nota, regras de IP | ☐ |
| Dois ensaios completos cronometrados a partir de um estado limpo | ☐ |
| Fone/caixa de som testados. **Use fone de ouvido** ou fale perto do microfone: o barge-in com alto-falante sem fone ainda **não foi testado com microfone real** (hand-off de 30/10) | ☐ |
| Permissão de microfone concedida no navegador da demo; notificações desligadas; volume ligado | ☐ |
| `pnpm dev` rodando; API em :4000 e web em :3000; `.env` com as chaves; MongoDB Atlas acessível | ☐ |
| Livro de História já ingerido; contexto da turma = “8º ano”; aluno demo criado; imagens de Roma em cache | ☐ |
| Segunda aba aberta na **versão fixture** (`DEMO_MODE=fixture`, `fixtures/turns/rome-intro.json`) | ☐ |
| **Vídeo de backup** gravado (2 min da demo completa) e screenshots do painel do professor, abertos em outra janela | ☐ |
| Conferir se o chip de fonte abre o PDF no trecho; se não abrir, o passo 5 vira “mostrar o chip: livro + página” | ☐ |
| Conferir se o painel ainda mostra o selo “dados simulados”; se o selo tiver sido removido, **falar** “estes alunos são fictícios” | ☐ |
| Preencher o slide final: pedido (valor, uso) e contato — **só o fundador sabe** | ☐ |

Papéis: **uma pessoa fala e conduz a demo**, uma vigia logs/latência e o interruptor de fallback, uma controla o tempo (cartão de 4:00 e 4:30).

## 1. Estrutura em uma olhada

| Tempo | Bloco | Objetivo | Palavras faladas* |
|---|---|---|---|
| 0:00–0:25 | **Gancho** | Prender com uma cena, não com um slide | ≈ 55 |
| 0:25–0:55 | **Problema** | Mostrar a dor do professor e do aluno | ≈ 70 |
| 0:55–1:10 | **Solução em uma frase** | Dizer o que é a Mento | ≈ 35 |
| 1:10–3:35 | **DEMO AO VIVO** | 6 momentos, 2 min 25 s | ≈ 150 (o resto é o produto falando) |
| 3:35–4:05 | **Por que é diferente** | O ciclo, não o quadro | ≈ 70 |
| 4:05–4:35 | **Três respostas ao desafio + honestidade** | Segura, preserva a aprendizagem, economiza tempo; o que temos e o que não temos; piloto | ≈ 75 |
| 4:35–5:00 | **Pedido e fecho** | Frase de efeito + pedido concreto | ≈ 55 |

\*Ritmo-alvo: 130 palavras/minuto (≈ 2 palavras por segundo), com pausas. Total falado ≈ 505 palavras; o restante são as falas do tutor e silêncios da demo. **Se estourar, corte do bloco “Por que é diferente”, nunca da demo.**

## 2. O roteiro minuto a minuto

### 0:00–0:25 · Gancho (em pé, sem tela, ou só o logo)

> *(Olhando para a plateia, voz calma.)*
> “Quatro em cada dez alunos dos anos finais **já usam IA** para estudar. *(pausa)* Mas **78% das escolas não têm nenhuma regra** sobre isso. *(pausa)* E o único experimento controlado que vimos mostrou que quem treina com um chatbot comum **tira nota pior** na prova sem IA: **menos 17%**. *(pausa de 2 s)* O desafio de vocês pergunta como usar IA com segurança, economizando tempo e **sem estragar a aprendizagem**. A resposta é: **o desenho da IA decide.**”

Alternativa (cena): “Uma professora, trinta e cinco alunos, e 15 horas por semana só para preparar aula e corrigir prova. Quantos alunos vão ter uma explicação só deles hoje?” *(TALIS 2024: 15,4 h/semana)*

### 0:25–0:55 · Problema

> “O aluno usa IA, mas ela **entrega a resposta**: ele treina com muleta e vai pior na prova. A escola não tem regra: **78%** sem guia. E o professor não tem tempo: **15 horas por semana** preparando e corrigindo, e só descobre a lacuna **na prova**, semanas depois.
> O problema não é falta de IA. É IA **sem desenho pedagógico** e **sem o professor no controle**.”

**Frase de efeito:** *“A IA respondeu. Mas ninguém ensinou — e ninguém ficou sabendo.”* · alternativa: *“Não é usar ou não usar IA. É qual IA, desenhada por quem, sob o controle de quem.”*

### 0:55–1:10 · Solução em uma frase

> “Esta é a **Mento**: um tutor que ensina cada aluno **por voz, num quadro-branco que ele mesmo escreve, desenha e circula ao vivo** — com base nos livros do professor — e que mostra ao professor como cada aluno está aprendendo.”

*(Troca para o navegador: tela do aluno já aberta, matéria “História” visível.)*

### 1:10–3:35 · DEMO AO VIVO (2 min 25 s)

Diga a frase de contexto **antes** de clicar: *“O professor subiu o livro de História e descreveu a turma: 8º ano. O aluno só abre a matéria.”* (≈ 8 s)

| # | Tempo | Faça (clique/fale) | Mostre | Diga | Critério de sucesso |
|---|---|---|---|---|---|
| **D1** | 1:10–1:40 | Clique no cartão **História**. O tutor cumprimenta por voz. Fale: **“Como Roma passou de República a Império?”** | A primeira escrita no quadro em ~2 s | “Reparem no tempo: **menos de dois segundos** para ele começar a escrever. É uma pergunta de aluno de verdade.” | Tutor começa a escrever/falar em ≲ 3 s |
| **D2** | 1:40–2:10 | Deixe o tutor trabalhar (fale pouco) | Título, linha do tempo, **ilustração** (Coliseu/Fórum) chegando, **círculos** em termos-chave enquanto ele fala | “Ele **escreve, desenha e circula** enquanto explica. Não é um slide pronto: é o tutor ensinando ao vivo.” | Imagem aparece; círculo no termo certo |
| **D3** | 2:10–2:35 | **Clique numa data** da linha do tempo (ex.: “27 a.C.”) e pergunte: **“Por que essa data?”** | A resposta falando daquele elemento | “O aluno **aponta** para o quadro e pergunta. O tutor responde sobre **aquele ponto**.” | Resposta menciona o elemento clicado |
| **D4** | 2:35–2:55 | Clique no **chip de fonte** (ex.: “Livro, p. 12”) | O livro abre no trecho citado (ou o chip com livro+página) | “E **de onde veio?** Do livro do professor, com a página. Quando sai do material, ele avisa.” | Citação visível |
| **D5** | 2:55–3:15 | Responda **errado** de propósito à pergunta de verificação (ex.: “Foi Júlio César que virou o primeiro imperador”) | O tutor corrige com gentileza e muda a explicação | “Ele **verifica** com uma pergunta nova. Errei de propósito: ele não me dá bronca, **muda a explicação** — e registra a evidência.” | Tutor adapta; evidência gravada |
| **D6** | 3:15–3:35 | Troque para a aba do **professor → Alunos** e abra o aluno da demo | Painel: conceito com lacuna, estágio (“em observação/lacuna”), lição de origem, sugestão de próximo passo | “Aqui está o ouro. **Sem o professor fazer nada**, a conversa virou isto: o conceito, **onde provavelmente começou** a dúvida no livro, e o que fazer na próxima aula. *(Fale com clareza:)* **estes alunos são fictícios** — dados simulados para a demonstração.” | Lacuna + origem + sugestão visíveis |

**Se houver silêncio de mais de 4 s** (tutor pensando, rede lenta), preencha com narração útil, nunca com desculpa:
- “Enquanto ele escreve, reparem que ele só usa o que está no livro do professor.”
- “Isso aqui roda com um modelo pequeno e rápido, para parecer conversa.”

### 3:35–4:05 · Por que é diferente

> “Quadro-branco com IA, voz e upload de PDF… isso **qualquer um copia**. Nós sabemos. *(pausa)* O que **não** se copia em um fim de semana é o **ciclo**:
> o professor define **o que** se aprende, o tutor **ensina cada aluno**, a conversa vira **evidência por conceito**, e o professor recebe **o diagnóstico e a ação**. O quadro é a interface. **O produto é o ciclo.**
> E tudo auditável: a gravidade e o diagnóstico vêm de **regras**, não de palpite da IA. A IA sugere, **o professor decide**.”

**Frase de efeito:** *“O quadro é a interface. O produto é o ciclo.”*

### 4:05–4:35 · Três respostas ao desafio e honestidade

> “Resumindo as três respostas ao desafio: **segura**, porque ancorada no livro do professor, com citação e o professor decide; **preserva a aprendizagem**, porque dá pista em vez de resposta e verifica; **economiza tempo**, porque a conversa vira diagnóstico e lista de exercícios sem o professor fazer nada.
> E vou ser direto, porque confiança é o nosso produto: **hoje não temos clientes nem prova de eficácia.** Temos um protótipo que funciona de ponta a ponta, feito em dois dias por três pessoas, e um **piloto de 6 a 8 semanas** desenhado para medir três coisas: a nota **sem IA** antes e depois, as **horas do professor** e a **segurança** das respostas. Se der fraco, a gente publica mesmo assim.”

*(Mercado, se perguntarem: 7º–9º ano, escolas privadas, começando pelo Recife; ≈ 1,4 milhão de alunos pela nossa conta, premissa a confirmar com o Inep. **Não falar de preço**: não foi definido nem testado.)*

### 4:35–5:00 · Pedido e fecho

> “O que pedimos hoje: **[PREENCHER: o pedido — ex.: uma escola parceira para o piloto / mentoria em pedagogia / a primeira conversa com a Teachy sobre integração / o investimento de R$ ___]**.
> A escola define o que se aprende. A Mento **ensina cada aluno** — e mostra ao professor **como ele está aprendendo**.
> Eu sou ___, e este é o time da Mento. Obrigado.”

**Frase final (decorar):** *“A escola define o que se aprende; a Mento ensina cada aluno e mostra ao professor como ele aprende.”* (a mesma do runbook)

## 3. Frases de efeito e linhas de reserva

| Quando | Frase |
|---|---|
| Gancho | “O ChatGPT respondeu. Mas ele sabia o que o seu professor ensinou? Ele descobriu se você entendeu?” |
| Problema | “A IA respondeu. Mas ninguém ensinou — e ninguém ficou sabendo.” |
| Solução | “Um tutor que escreve, desenha e circula ao vivo, no livro do seu professor.” |
| Demo (latência) | “Menos de dois segundos entre a sua pergunta e o primeiro traço no quadro.” |
| Demo (clique) | “Aponte para o quadro e pergunte. É como levantar a mão — só que para a aula inteira.” |
| Demo (painel) | “O professor não fez nada. A conversa virou diagnóstico.” |
| Privacidade | “A IA esquece tudo. A escola lembra, com os dados da escola.” *(diga “arquitetura compatível com retenção zero”, **não** “somos ZDR”)* |
| Diferencial | “O quadro é a interface. O produto é o ciclo.” |
| Honestidade | “Não temos clientes. Temos uma tese e um protótipo — e um piloto desenhado para provar ou refutar.” |
| Fecho | “A escola define o que se aprende; a Mento ensina cada aluno e mostra como ele aprende.” |

## 4. Plano B: se algo falhar na demo

**Princípio (pesquisa):** os jurados perdoam falha técnica; não perdoam pânico nem desculpa longa. Troque de plano **em silêncio e com calma**, diga em **uma frase** o que está fazendo e continue a história. Nunca peça desculpa por mais de uma frase, nunca abra o terminal ou o código.

| Se falhar… | Faça | Frase |
|---|---|---|
| **Microfone/STT** | Digite a pergunta no chat (modo texto) | “Vou digitar; a voz funciona, e mostro a versão por texto.” |
| **TTS lento/mudo** | Siga pelas legendas | “Aqui ele fala; vou deixar as legendas rodando.” |
| **Imagem não chega** | Continue; o quadro tem placeholder e imagens em cache | “A imagem chega assíncrona; sigo com o resto.” |
| **LLM lento ou erro** | Troque para a **aba fixture** (`DEMO_MODE=fixture`, `rome-intro.json`) | “Troquei para a sessão gravada para não perder tempo; o fluxo é o mesmo.” |
| **PDF não abre** | Mostre o chip com livro + página | “O chip mostra livro e página; o trecho destacado é o próximo passo do produto.” |
| **Sem internet** | Fixture + imagens em cache; painel lendo o banco local; se não houver nem isso, **vídeo de backup** | “A rede caiu; mostro a gravação desta mesma demonstração.” |
| **Navegador travou** | Reabra; retome pelo histórico (a sessão fica no banco) ou vá ao vídeo | — |
| **Tempo estourou** | Pule D4 (fonte); nunca pule D1, D2 e D6 | — |

**Regra de ouro do tempo:** cartão de **4:00** (“você precisa estar entrando em ‘Por que é diferente’”) e de **4:30** (“vá para o pedido”).

## 5. Preparação de perguntas e respostas (Q&A)

Respostas **curtas (≤ 30 s)** e honestas. Se não souber: “Não sabemos ainda; é exatamente o que o piloto mede.”

**Produto e pedagogia**

1. **“Isso funciona? Aprendem mais?”** — “Não sabemos. Não temos teste com alunos nem prova de eficácia. Temos um piloto de 6–8 semanas desenhado, com avaliação antes e depois e metodologia aberta, inclusive se o resultado for fraco.”
2. **“E se a IA errar ou inventar?”** — “Ela responde a partir do livro do professor e cita a página; as citações são validadas contra o texto; quando sai do material, avisa. Mesmo assim pode errar: por isso o professor vê e decide, e vamos testar com mais livros antes do piloto.”
3. **“Isso não é só mais um chatbot com PDF?”** — “O chat é a parte menor. O produto é o ciclo: o tutor verifica a compreensão, grava evidência por conceito, localiza a lição de origem da lacuna por um grafo de pré-requisitos do livro e sugere a ação ao professor.”
4. **“A IA vai substituir o professor?”** — “Não. A IA sugere; o professor decide. O painel é para ele, e a IA nunca decide aprovação ou reprovação.”
5. **“Funciona para matemática?”** — “Hoje só demonstramos História, com um livro. Matemática é a próxima matéria, ainda não está pronta.”
6. **“Os dados do painel são reais?”** — “Os alunos são fictícios. A lacuna que vocês viram foi gerada de verdade a partir da conversa ao vivo.” *(se for verdade no dia — confirme no ensaio)*

**Desafio 3, mercado e próximos passos**

7. **“Como vocês sabem que isso preserva a aprendizagem?”** — “Ainda não sabemos. O desenho segue o que o estudo da PNAS mostrou: tutor com pista em vez de resposta não piorou a prova, o chatbot comum piorou 17%. Nós **não** provamos o efeito: o piloto mede a nota sem IA antes e depois, com turma de comparação.”
8. **“Como isso economiza tempo do professor?”** — “Três mecanismos: a dúvida individual vai para o tutor, a conversa vira diagnóstico automático (conceito, lição de origem, próximo passo), e a lista de exercícios sai do livro. Não medimos horas ainda; o piloto mede com questionário e diário de tempo. O dado de 5,9 h do Gallup é dos EUA e autorrelato — não é nosso.”
9. **“E a segurança? O aluno é menor.”** — “Respostas só do livro do professor, citação validada, aviso quando sai do material; sem inferência psicológica; dado pessoal nunca vai ao modelo; arquitetura compatível com retenção zero (não somos certificados). Antes de aluno real: base legal LGPD, consentimento e revisão jurídica.”
10. **“O aluno não vai simplesmente pedir a resposta?”** — “Pode tentar. O tutor dá pista em três níveis e pergunta de volta; medimos quantas vezes entregou a resposta direta. É um risco real que o piloto monitora.”
11. **“Qual o tamanho do mercado? Quanto cobram?”** — “Recorte: 7º–9º ano de escolas privadas, ≈ 1,4 milhão de alunos pela nossa conta, premissa a confirmar. Preço **ainda não definimos**: só faz sentido depois do piloto, com custo real por aluno e disposição a pagar medidos.”
12. **“Qual a tração?”** — “Zero clientes. [Se houver: N entrevistas / N cartas de intenção.] Preferimos dizer isso a inflar.”

**Concorrência**

13. **“Por que a Teachy/Flint/ChatGPT não faz isso?”** — “Cada um resolve bem uma parte. A nossa aposta é **centralizar**: alunos, professores, turmas e materiais no mesmo lugar. O tutor já conhece a série, a turma e o livro do professor; o aluno não arrasta PDF nem reexplica o contexto, e o que ele aprende volta como diagnóstico para o professor. Em vez de um quadro-branco genérico que resolve um problema, a plataforma resolve vários de uma vez. E complementa plataformas como a Teachy.”
14. **“Qual o fosso?”** — “Hoje é fraco: quadro e voz se copiam. O fosso esperado é o dado de aprendizagem ligado ao currículo de cada escola e a integração no fluxo do professor. Ainda não existe em escala.”
15. **“Vocês querem ser comprados pela Teachy?”** — “Queremos provar valor. Complementar a Teachy é uma hipótese; não houve conversa nem interesse manifestado.”

**Tecnologia e privacidade**

16. **“E os dados de menores? LGPD?”** — “Arquitetura compatível com retenção zero: a IA não guarda estado, a memória fica no banco da escola, corrigível e apagável; dados pessoais nunca vão para o modelo. Não somos ZDR certificados. Antes de qualquer aluno real: base legal, consentimento dos responsáveis e revisão jurídica.”
17. **“Dependem de APIs de terceiros?”** — “Sim (Anthropic, ElevenLabs, Deepgram, Google, Voyage, MongoDB). Cada uma está atrás de uma camada própria, com alternativas mapeadas; o custo real por sessão é medido no piloto.”
18. **“Quão rápido é?”** — “Medimos 1,8 s de mediana entre a fala e a primeira ação no quadro; 2 s com o prompt didático novo.”
19. **“O que não funciona ainda?”** — “Sem login nem multi-escola; uma matéria; sem teste com alunos reais; barge-in com alto-falante sem fone ainda não testado com microfone real.”

**Equipe e pedido**

20. **“Por que vocês?”** — [PREENCHER: experiência, execução (214 commits em ~1,5 dia, CI, contratos compartilhados), acesso a escolas.]
21. **“O que fariam com o apoio/dinheiro?”** — “Primeiro o necessário para o piloto: login e multi-turma, revisão jurídica LGPD, desenho do estudo com pesquisador em educação e custo dos provedores de IA durante o piloto. Percentuais só depois de definir a escola e o valor.”
22. **“Qual o pedido?”** — [PREENCHER] — sem tração, evite inventar valor; fale em marco: “o que precisamos para chegar ao piloto concluído”.

## 6. O que os jurados avaliam e erros comuns

Pesquisa feita em 31/10/2026 (guias de organizadores de hackathons e blogs; **não** são pesquisas primárias — tratar como regra de bolso):

- **Estrutura típica:** Problema → Solução → Demo → Impacto → Pedido; demos de 2–5 min; problema em 15–20 s; mostrar só as 1–3 funcionalidades mais fortes; fechar com pedido de 5–10 s.
- **O que costuma ser nota:** funciona de verdade, ambição técnica, acabamento, problema real e narrativa. Sem rubrica, os jurados tendem a pontuar **qualidade da demo e história**. Demo funcionando vale mais que deck bonito.
- **Erros comuns:** abrir código ou terminal, pedir desculpa por falha, tentar mostrar coisa demais, depender de digitação ao vivo de última hora, estourar o tempo.
- **Se a demo falhar:** ter vídeo gravado, screenshots e dados semeados; trocar para o backup e dizer isso com calma. Jurados valorizam times que lidam bem com a falha.
- **Para investidores (VC):** clareza imediata (o que a empresa faz), equipe, tração, insight único, tamanho de mercado e **o pedido** (Seibel/YC; Paul Graham); honestidade sobre o que ainda não existe cria credibilidade.

### Fontes (consultadas em 31/10/2026)

- AngelHack, “10 tips to help you rock your next hackathon demo” — https://angelhack.com/blog/10-tips-to-help-you-rock-your-next-hackathon-demo/
- Reskilll, “Hackathon Demo and Presentation Tips: How to Pitch in 3 Minutes and Win” — https://blogs.reskilll.com/hackathon-demo-presentation-tips-pitch-3-minutes-win-2026/
- Reskilll, “How to Win a Hackathon in 2026” — https://blogs.reskilll.com/how-to-win-a-hackathon-in-2026-reskillls-guide-from-5000-events/
- TechCrunch, “Best Practices for Hackathon Demo Days” — https://techcrunch.com/?p=546803
- HackerEarth, “10 tips to win a hackathon” — https://www.hackerearth.com/blog/10-tips-win-hackathon
- Paul Graham, “How to Present to Investors” — https://paulgraham.com/investors.html
- SaaStr, Michael Seibel (YC) on pitching at seed — https://www.saastr.com/how-to-pitch-your-seed-stage-startup-with-y-combinators-michael-seibel

## 7. Checklist final de honestidade (leia 1 minuto antes)

- ☐ Não digo “clientes”, “receita” ou “pilotos”: não existem.
- ☐ Digo “alunos fictícios / dados simulados” ao mostrar o painel.
- ☐ Digo “arquitetura compatível com retenção zero”, não “somos ZDR”.
- ☐ Não afirmo que a Teachy/Flint “não têm” algo.
- ☐ Números de mercado: “estimativa nossa, premissas no plano”.
- ☐ Não menciono eficácia nem ganho de aprendizagem como fato.
