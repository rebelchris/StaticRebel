/**
 * Project Generator
 * Dynamically generates project files from LLM specifications
 */

import fs from 'fs/promises';
import path from 'path';

export async function generateProject(spec, context = {}) {
  const { name, type = 'web-app', tech = ['javascript'], files = [], description = '' } = spec;

  const projectName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const projectPath = path.join(context.cwd || process.cwd(), projectName);

  await fs.mkdir(projectPath, { recursive: true });

  const generatedFiles = [];

  for (const file of files) {
    const filePath = path.join(projectPath, file.path || file.name);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content || '');
    generatedFiles.push(filePath);
  }

  const techSet = new Set(tech.map(t => t.toLowerCase()));
  const hasNode = techSet.has('node') || techSet.has('javascript');
  const hasReact = techSet.has('react');
  const hasHtml = techSet.has('html') || techSet.has('vanilla');

  if (hasNode && !files.some(f => f.name === 'package.json')) {
    const packageJson = {
      name: projectName,
      version: '1.0.0',
      description: description || `A ${projectName} project`,
      type: 'module',
      scripts: {
        dev: 'node index.js',
        start: 'node index.js',
        test: 'echo \"Error: no test specified\" && exit 1'
      },
      keywords: [],
      author: '',
      license: 'MIT'
    };

    if (hasReact) {
      packageJson.scripts = {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview'
      };
      packageJson.dependencies = {
        ...packageJson.dependencies,
        react: '^18.2.0',
        'react-dom': '^18.2.0'
      };
      packageJson.devDependencies = {
        ...packageJson.devDependencies,
        vite: '^5.0.0',
        '@vitejs/plugin-react': '^4.2.0'
      };
    }

    await fs.writeFile(path.join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));
    generatedFiles.push(path.join(projectPath, 'package.json'));
  }

  if (hasHtml && !files.some(f => f.name === 'index.html')) {
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; padding: 2rem; }
  </style>
</head>
<body>
  <h1>${name}</h1>
  <p>${description}</p>
  <script type="module" src="./main.js"></script>
</body>
</html>`;

    if (hasReact) {
      html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/main.jsx"></script>
</body>
</html>`;

      await fs.mkdir(path.join(projectPath, 'src'), { recursive: true });
      await fs.writeFile(path.join(projectPath, 'src/main.jsx'), `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`);

      await fs.writeFile(path.join(projectPath, 'src/App.jsx'), `import { useState } from 'react';

export default function App() {
  const [todos, setTodos] = useState([]);
  const [input, setInput] = useState('');

  const addTodo = () => {
    if (input.trim()) {
      setTodos([...todos, { id: Date.now(), text: input.trim() }]);
      setInput('');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '2rem auto', padding: '1rem' }}>
      <h1>${name}</h1>
      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a task..."
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <button onClick={addTodo} style={{ padding: '0.5rem 1rem' }}>Add</button>
      </div>
      <ul style={{ listStyle: 'none' }}>
        {todos.map(todo => (
          <li key={todo.id} style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
            {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
}`);

      await fs.writeFile(path.join(projectPath, 'vite.config.js'), `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});`);

      generatedFiles.push(
        path.join(projectPath, 'src/main.jsx'),
        path.join(projectPath, 'src/App.jsx'),
        path.join(projectPath, 'vite.config.js')
      );
    }

    await fs.writeFile(path.join(projectPath, 'index.html'), html);
    generatedFiles.push(path.join(projectPath, 'index.html'));
  }

  if (hasNode && !hasReact && !files.some(f => f.name === 'main.js')) {
    await fs.writeFile(path.join(projectPath, 'main.js'), `// ${name} - Main Entry Point
console.log('${name} is running!');
// Add your code here
`);
    generatedFiles.push(path.join(projectPath, 'main.js'));
  }

  if (techSet.has('css') && !files.some(f => f.name?.includes('style'))) {
    await fs.writeFile(path.join(projectPath, 'style.css'), `/* ${name} Styles */
body {
  font-family: system-ui, -apple-system, sans-serif;
  padding: 2rem;
}
`);
    generatedFiles.push(path.join(projectPath, 'style.css'));
  }

  await fs.writeFile(path.join(projectPath, 'README.md'), `# ${name}

${description || 'Auto-generated project'}

## Tech Stack
${tech.map(t => `- ${t}`).join('\n')}

## Getting Started

\`\`\`bash
cd ${projectName}
npm install
npm run dev
\`\`\`

## Generated Files
${generatedFiles.map(f => `- ${path.relative(projectPath, f)}`).join('\n')}
`);

  generatedFiles.push(path.join(projectPath, 'README.md'));

  return projectPath;
}

export default generateProject;
