import sys

def trace(filename, start_line, end_line):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    count = 0
    start = max(0, start_line - 1)
    end = min(len(lines), end_line)
    
    for i in range(start, end):
        line = lines[i]
        # Ignore comments
        if "//" in line:
            line = line.split("//")[0]
        
        open_b = line.count('{')
        close_b = line.count('}')
        count += (open_b - close_b)
        
        print(f"L{i+1} [{count}]: {line.strip()}")

# Find the start of mainContent
with open("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", 'r') as f:
    lines = f.readlines()
start = 0
for i, line in enumerate(lines):
    if "private func mainContent() -> some View {" in line:
        start = i + 1
        break

trace("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", start, start+50)
