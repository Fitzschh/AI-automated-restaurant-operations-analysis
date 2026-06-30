import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AgentProvider } from './context/AgentContext';
import { LiveAnalystProvider } from './context/LiveAnalystProvider';
import { WorkflowNotificationProvider } from './context/WorkflowNotificationProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AgentProvider>
              <LiveAnalystProvider>
                <WorkflowNotificationProvider>
                  <App />
                </WorkflowNotificationProvider>
              </LiveAnalystProvider>
            </AgentProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
