import sys

def trace(filename):
    with open(filename, 'r') as f:
        lines = f.readlines()
    
    start = 0
    for i, line in enumerate(lines):
        if "if canPaginate, let album = playerBridge.nativeAlbumData {" in line:
            start = i
            break
            
    count = 0
    end = start
    for i in range(start, len(lines)):
        line = lines[i]
        if "//" in line:
            line = line.split("//")[0]
        
        open_b = line.count('{')
        close_b = line.count('}')
        count += (open_b - close_b)
        
        print(f"L{i+1} [{count}]: {line.strip()}")
        if count == 0 and open_b > 0:
            end = i
            break

trace("/Users/p33/Desktop/XCODE PROJECTS/Kyoyu/Kyoyu/ContentView.swift")
