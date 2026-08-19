import sys

def trace():
    with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", 'r') as f:
        content = f.read()
        
    start = content.find("private func sheetContent() -> some View {")
    count = 0
    end = -1
    for i in range(start, len(content)):
        if content[i] == '{':
            count += 1
        elif content[i] == '}':
            count -= 1
            if count == 0:
                end = i
                break
                
    print(content[start:end+1])

trace()
