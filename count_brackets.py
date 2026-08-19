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

trace("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift", 4667, 5068)
