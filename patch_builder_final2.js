const fs = require('fs');
let code = fs.readFileSync('modules/game-modes-v2.js', 'utf8');

code = code.replace(
    /window\.addQuizQuestionUI = \(\) => \{\s*quizBuilderQuestions\.push\(createEmptyQuizQuestion\(\)\);\s*window\.activeQuizBuilderIndex = quizBuilderQuestions\.length - 1;\s*updateBuilderUI\(\);\s*\};/,
    `window.addQuizQuestionUI = () => {
        quizBuilderQuestions.push(createEmptyQuizQuestion());
        updateBuilderUI();
        const targetDiv = document.getElementById(\`quiz-builder-item-\${quizBuilderQuestions.length - 1}\`);
        if (targetDiv) targetDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };`
);

fs.writeFileSync('modules/game-modes-v2.js', code);
