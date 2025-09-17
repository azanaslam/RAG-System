import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

export default function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const chatEndRef = useRef(null);
  const [file, setFile] = useState(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiThinking]);

  const askQuestion = async () => {
    if (!question.trim()) return;
    const newMessages = [...messages, { sender: "user", text: question }];
    setMessages(newMessages);
    setQuestion("");
    setAiThinking(true);

    try {
      const { data } = await axios.post("https://rag-system-y67x.vercel.app/ask", { question });
      setMessages([...newMessages, { sender: "bot", text: data.answer }]);
    } catch (err) {
      setMessages([...newMessages, { sender: "bot", text: "⚠️ Error: " + err.message }]);
    }
    setAiThinking(false);
  };

  const uploadPDF = async () => {
    if (!file) return alert("Select a PDF first!");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await axios.post(
        "https://rag-system-y67x.vercel.app/upload",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      alert("✅ " + data.message);
    } catch (err) {
      alert("❌ Upload failed: " + err.message);
    }
  };

  const theme = darkMode
    ? {
        page: "#0f111a",
        chat: "#1a1c2a",
        user: ["#3b82f6", "#fff"],
        bot: ["#2a2c3d", "#e0f2fe"],
        input: ["#1a1c2a", "#fff", "#3b3f55"],
        btn: ["#3b82f6", "#fff"],
      }
    : {
        page: "#f3f4f6",
        chat: "#fff",
        user: ["#3b82f6", "#fff"],
        bot: ["#e0f2fe", "#0369a1"],
        input: ["#fff", "#000", "#60a5fa"],
        btn: ["#3b82f6", "#fff"],
      };

  return (
    <div style={{ ...styles.page, background: theme.page }}>
      {/* Toggle Button */}
      <div style={styles.toggleWrapper}>
        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{ ...styles.toggleBtn, background: theme.btn[0], color: theme.btn[1] }}
        >
          {darkMode ? "🌙 Dark" : "☀️ Light"}
        </button>
      </div>

      {/* File Upload */}
      <div style={styles.uploadWrapper}>
        <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0])} />
        <button onClick={uploadPDF} style={{ ...styles.askBtn, background: theme.btn[0], color: theme.btn[1] }}>
          📂 Upload PDF
        </button>
      </div>

      {/* Chat Box */}
      <div style={{ ...styles.chatBox, background: theme.chat }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              ...styles.msg,
              alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
              background: m.sender === "user" ? theme.user[0] : theme.bot[0],
              color: m.sender === "user" ? theme.user[1] : theme.bot[1],
            }}
          >
            {m.text}
          </div>
        ))}

        {/* AI Thinking Animation */}
        {aiThinking && (
          <div style={{ ...styles.msg, alignSelf: "flex-start", background: theme.bot[0], color: theme.bot[1], fontStyle: "italic" }}>
            <span style={styles.thinkingWrapper}>
              🤖 AI is thinking
              <span style={styles.dots}></span>
            </span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div style={{ ...styles.inputBox, background: theme.chat }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && askQuestion()}
          placeholder="Type your question..."
          style={{
            ...styles.input,
            background: theme.input[0],
            color: theme.input[1],
            border: `1px solid ${theme.input[2]}`,
          }}
        />
        <button onClick={askQuestion} style={{ ...styles.askBtn, background: theme.btn[0], color: theme.btn[1] }}>
          🚀 Ask
        </button>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn { 
          from { opacity:0; transform:translateY(5px);} 
          to { opacity:1; transform:translateY(0);} 
        }
        @keyframes dotsBlink { 
          0% { content: ''; } 
          33% { content: '.'; } 
          66% { content: '..'; } 
          100% { content: '...'; } 
        }
      `}</style>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "Arial, sans-serif" },
  toggleWrapper: { display: "flex", justifyContent: "flex-end", padding: "10px 20px" },
  toggleBtn: { padding: "10px 20px", borderRadius: "12px", border: "none", cursor: "pointer", fontSize: ".95rem", fontWeight: 600 },
  uploadWrapper: { display: "flex", gap: "10px", padding: "10px 20px" },
  chatBox: { flex: 1, display: "flex", flexDirection: "column", padding: 20, gap: 12, overflowY: "auto" },
  msg: { padding: "12px 20px", borderRadius: 20, maxWidth: "75%", wordBreak: "break-word", fontSize: ".95rem", animation: "fadeIn .3s ease" },
  inputBox: { display: "flex", gap: 12, padding: "15px 20px" },
  input: { flex: 1, padding: 14, borderRadius: 12, fontSize: "1rem", outline: "none" },
  askBtn: { padding: "14px 25px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: "1rem", transition: "0.3s" },
  thinkingWrapper: { display: "flex", alignItems: "center", gap: "6px" },
  dots: { display: "inline-block", marginLeft: 5, animation: "dotsBlink 1s infinite steps(3,end)" },
};
