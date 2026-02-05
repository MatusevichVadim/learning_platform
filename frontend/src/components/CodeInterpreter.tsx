import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { oneDark } from '@codemirror/theme-one-dark'

export default function CodeInterpreter({ value, onChange, language }: {
  value: string,
  onChange: (value: string) => void,
  language: string
}): JSX.Element {

  const getExtensions = () => {
    if (language === 'python') {
      return [python()]
    } else if (language === 'csharp') {
      return [java()] // Using Java for C# syntax highlighting
    }
    return []
  }

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={getExtensions()}
      theme={oneDark}
      height="200px"
    />
  )
}