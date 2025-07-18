export default defineEventHandler(() => {
  const allQuestions = [
    "What is the mission of the Museum of Crypto Art?",
    "How did MOCA impact web3 culture over the past years?",
    "Can you tell me about the Genesis Collection?",
    "What is the $MOCA token all about?",
    "Which orgs are most important for cryptoart?",
    "How does the MOCA support the artists?",
    "What makes the Museum of Crypto Art different from traditional museums?",
    "How does Blockchain technology influence digital art?",
    "What are the origins of Cryptoart?",
    "Which notable artists are featured in the MOCA collection?",
    "How can I contribute to the Museum of Crypto Art?",
    "Can you please explain MOCA ROOMs?",
    "How does MOCA handle curation and exhibition of digital art?",
    "What are art decc0s and whats the origin of them?",
    "Can you explain the MOCA 2.0 roadmap for a five year old?",
    "How can I participate in the MOCA DAO?",
    "Which virtual exhibitions has MOCA hosted in the past?",
    "How does MOCA preserve the history of crypto art?",
  ];

  // Create a copy of the allQuestions array
  const questionsCopy = [ ...allQuestions ];
  const selectedQuestions = [];

  // Select 6 random questions
  for (let i = 0; i < 6; i++) {
    if (questionsCopy.length === 0) break;
    const randomIndex = Math.floor(Math.random() * questionsCopy.length);
    selectedQuestions.push(questionsCopy.splice(randomIndex, 1)[0]);
  }

  return selectedQuestions;
});
