# agent-harness-stuff

Pacchetto Pi condiviso. `pi/extensions/question-tool` contiene un adattamento di [`pi-question-tool` 0.1.1](https://github.com/SakikoTogawa233/pi-question-tool), copyright 2026 SakikoTogawa233, con licenza MIT riportata nella directory dell'estensione. Il codice originale deriva dagli esempi Pi `question.ts` e `questionnaire.ts`.

I tool `question` e `questionnaire` conservano l'interfaccia del pacchetto originale. Con Pi 1.5.0 segnalano `blocked` (tipo `question`) mentre aspettano una risposta; il titolo dello stato è fisso e non contiene la domanda. Al completamento o annullamento Pi ripristina lo stato precedente. La visualizzazione dipende dal supporto OSC 7501 del terminale; non installare contemporaneamente il pacchetto originale con gli stessi tool.

Per verificare il codice in isolamento con Node.js 24:

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
```

La suite confronta schemi, schermate e risultati selezionati con l'originale e simula lo stato di attesa. Per verificare separatamente Pi 1.5.0 offline con dati e impostazioni sintetici:

```sh
python3 tests/pi-osc-test.py
```

La prova usa uno pseudoterminale e comandi sintetici senza modello: verifica il caricamento dei tool e OSC 7501 con ripristino allo stato `idle` alla risposta e all'annullamento. Non dimostra la resa di ogni terminale né lo stato `working` durante un turno reale del modello.
